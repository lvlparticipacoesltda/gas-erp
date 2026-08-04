'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Modal } from '@/components/modal';
import { Button } from '@/components/ui';

interface ConfirmOptions {
  title: string;
  /** Explique a consequência, não repita o título. */
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` para ações destrutivas (exclusão, cancelamento, estorno). */
  tone?: 'danger' | 'default';
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Substitui o `window.confirm` nativo: bloqueava a aba inteira, ignorava a
 * identidade do sistema e não deixava destacar o que estava sendo apagado.
 */
export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error('useConfirm precisa estar dentro de <ConfirmProvider>');
  return confirm;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  // Fechar por Esc, overlay ou "Cancelar" resolve como negativa — nunca deixa
  // a promise pendurada, senão o fluxo que chamou trava para sempre.
  const settle = useCallback((value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  }, []);

  const isDanger = options?.tone === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ''}
        size="sm"
        // Ação destrutiva começa com o foco em "Cancelar": Enter apressado não
        // deve apagar nada.
        initialFocus={isDanger ? 'cancel' : 'confirm'}
      >
        {options?.description && (
          <p className="text-sm text-slate-600">{options.description}</p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button
            type="button"
            variant="secondary"
            data-modal-focus="cancel"
            onClick={() => settle(false)}
          >
            {options?.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button
            type="button"
            variant={isDanger ? 'danger' : 'primary'}
            data-modal-focus="confirm"
            onClick={() => settle(true)}
          >
            {options?.confirmLabel ?? 'Confirmar'}
          </Button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}
