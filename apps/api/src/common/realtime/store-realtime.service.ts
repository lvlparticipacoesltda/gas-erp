import { Injectable, MessageEvent } from '@nestjs/common';
import type { IncomingMessage } from 'http';
import { Observable, Subject } from 'rxjs';

export type StoreRealtimeReason =
  | 'sale_created'
  | 'sale_updated'
  | 'sale_status'
  | 'sale_payments'
  | 'delivery_updated'
  | 'notification_created';

export interface StoreRealtimeEvent {
  storeId: string;
  organizationId: string;
  reason: StoreRealtimeReason;
  at: string;
}

@Injectable()
export class StoreRealtimeService {
  private readonly storeSubjects = new Map<string, Subject<StoreRealtimeEvent>>();
  private readonly orgSubjects = new Map<string, Subject<StoreRealtimeEvent>>();

  notifyStoreChange(
    storeId: string,
    organizationId: string,
    reason: StoreRealtimeReason,
  ) {
    const event: StoreRealtimeEvent = {
      storeId,
      organizationId,
      reason,
      at: new Date().toISOString(),
    };
    this.getStoreSubject(storeId).next(event);
    this.getOrgSubject(organizationId).next(event);
  }

  streamStore(storeId: string, req: IncomingMessage): Observable<MessageEvent> {
    return this.createStream(this.getStoreSubject(storeId), req);
  }

  streamOrg(organizationId: string, req: IncomingMessage): Observable<MessageEvent> {
    return this.createStream(this.getOrgSubject(organizationId), req);
  }

  private createStream(
    subject: Subject<StoreRealtimeEvent>,
    req: IncomingMessage,
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      const subscription = subject.subscribe((event) => {
        subscriber.next({ data: event });
      });

      const heartbeat = setInterval(() => {
        subscriber.next({ data: { type: 'heartbeat', at: new Date().toISOString() } });
      }, 30_000);

      const cleanup = () => {
        subscription.unsubscribe();
        clearInterval(heartbeat);
        subscriber.complete();
      };

      req.on('close', cleanup);
      req.on('aborted', cleanup);

      return cleanup;
    });
  }

  private getStoreSubject(storeId: string) {
    let subject = this.storeSubjects.get(storeId);
    if (!subject) {
      subject = new Subject<StoreRealtimeEvent>();
      this.storeSubjects.set(storeId, subject);
    }
    return subject;
  }

  private getOrgSubject(organizationId: string) {
    let subject = this.orgSubjects.get(organizationId);
    if (!subject) {
      subject = new Subject<StoreRealtimeEvent>();
      this.orgSubjects.set(organizationId, subject);
    }
    return subject;
  }
}
