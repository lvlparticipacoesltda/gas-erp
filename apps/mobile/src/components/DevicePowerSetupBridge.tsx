import { useCallback, useEffect, useState } from 'react';
import { useDelivererAvailability } from '@/lib/deliverer-availability-context';
import { shouldShowDevicePowerSetup } from '@/lib/device-power-setup';
import { DevicePowerSetupModal } from '@/components/DevicePowerSetupModal';

/** Assistente de bateria / início automático para entregadores disponíveis (Android). */
export function DevicePowerSetupBridge() {
  const { me } = useDelivererAvailability();
  const [visible, setVisible] = useState(false);

  const evaluate = useCallback(async () => {
    if (!me?.sharingLocation) {
      setVisible(false);
      return;
    }
    const show = await shouldShowDevicePowerSetup(me.sharingLocation);
    setVisible(show);
  }, [me?.sharingLocation]);

  useEffect(() => {
    void evaluate();
  }, [evaluate]);

  return (
    <DevicePowerSetupModal
      visible={visible}
      onCompleted={() => {
        setVisible(false);
        void evaluate();
      }}
    />
  );
}
