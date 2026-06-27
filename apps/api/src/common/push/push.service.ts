import { Injectable, Logger } from '@nestjs/common';
import { DELIVERY_PUSH_CHANNEL_ID, DELIVERY_PUSH_SOUND } from '@gas-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

type SaleAddress = {
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryComplement: string | null;
  deliveryNeighborhood: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryLandmark: string | null;
  customer?: { name: string | null } | null;
};

function formatAddress(sale: SaleAddress): string | null {
  const parts: string[] = [];
  const street = [sale.deliveryStreet, sale.deliveryNumber].filter(Boolean).join(', ');
  if (street) parts.push(street);
  if (sale.deliveryNeighborhood) parts.push(sale.deliveryNeighborhood);
  const city = [sale.deliveryCity, sale.deliveryState].filter(Boolean).join(' - ');
  if (city) parts.push(city);
  return parts.length ? parts.join(' · ') : null;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  async notifyNewDelivery(delivererId: string, deliveryId: string): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        deliverer: { select: { id: true, expoPushToken: true } },
        sale: { include: { customer: { select: { name: true } } } },
      },
    });
    if (!delivery || delivery.delivererId !== delivererId) return;

    const customer = delivery.sale.customer?.name ?? 'Cliente';
    const address = formatAddress(delivery.sale);
    const body = address ? `${customer} · ${address}` : customer;

    await this.sendToDeliverer(delivererId, {
      title: 'Nova entrega aguardando',
      body,
      data: { type: 'NEW_DELIVERY', deliveryId },
    }, 'NEW_DELIVERY');
  }

  async notifyDeliveryCancelled(delivererId: string, deliveryId: string): Promise<void> {
    await this.sendToDeliverer(delivererId, {
      title: 'Entrega cancelada',
      body: 'Uma entrega atribuída a você foi cancelada pela loja.',
      data: { type: 'DELIVERY_CANCELLED', deliveryId },
    }, 'DELIVERY_CANCELLED');
  }

  /** Lembrete periódico enquanto a rota segue aguardando aceite. Retorna true se enviou. */
  async notifyPendingDeliveryReminder(
    delivererId: string,
    deliveryId: string,
  ): Promise<boolean> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        deliverer: { select: { expoPushToken: true } },
        sale: { include: { customer: { select: { name: true } } } },
      },
    });
    if (!delivery || delivery.status !== 'PENDING' || delivery.delivererId !== delivererId) {
      return false;
    }

    const customer = delivery.sale.customer?.name ?? 'Cliente';
    const address = formatAddress(delivery.sale);
    const body = address
      ? `${customer} · ${address}`
      : 'Você ainda não aceitou esta rota.';

    const result = await this.sendToDeliverer(
      delivererId,
      {
        title: 'Rota aguardando aceite',
        body,
        data: { type: 'PENDING_DELIVERY_REMINDER', deliveryId },
      },
      'PENDING_DELIVERY_REMINDER',
    );
    return result === 'sent';
  }

  private async sendToDeliverer(
    delivererId: string,
    message: { title: string; body: string; data: Record<string, string> },
    eventType: string,
    knownToken?: string,
  ): Promise<'sent' | 'invalid' | 'skipped'> {
    const token =
      knownToken ??
      (
        await this.prisma.deliverer.findUnique({
          where: { id: delivererId },
          select: { expoPushToken: true },
        })
      )?.expoPushToken;

    if (!token) {
      this.logger.warn(
        `Push ${eventType} ignorado: entregador ${delivererId} sem expoPushToken registrado`,
      );
      return 'skipped';
    }

    const ok = await this.sendExpoPush(token, message, eventType, delivererId);
    if (ok === 'invalid') {
      this.logger.warn(`Push ${eventType}: token inválido removido do entregador ${delivererId}`);
      await this.prisma.deliverer.update({
        where: { id: delivererId },
        data: { expoPushToken: null, pushTokenUpdatedAt: null },
      });
    }
    return ok;
  }

  /** Retorna 'sent' | 'invalid' | 'skipped'. */
  private async sendExpoPush(
    token: string,
    message: { title: string; body: string; data: Record<string, string> },
    eventType: string,
    delivererId: string,
  ): Promise<'sent' | 'invalid' | 'skipped'> {
    try {
      const res = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: token,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: DELIVERY_PUSH_SOUND,
          channelId: DELIVERY_PUSH_CHANNEL_ID,
          priority: 'high',
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        this.logger.warn(`Expo push HTTP ${res.status}: ${text}`);
        return 'skipped';
      }

      const payload = (await res.json()) as {
        data?: { status?: string; details?: { error?: string } }[];
      };
      const ticket = payload.data?.[0];
      if (!ticket) return 'skipped';

      if (ticket.status === 'ok') {
        this.logger.log(`Push ${eventType} enviado para entregador ${delivererId}`);
        return 'sent';
      }

      const error = ticket.details?.error;
      if (error === 'DeviceNotRegistered') return 'invalid';

      this.logger.warn(`Expo push ticket error: ${error ?? ticket.status}`);
      return 'skipped';
    } catch (err) {
      this.logger.warn(`Falha ao enviar push: ${err instanceof Error ? err.message : err}`);
      return 'skipped';
    }
  }
}
