import type { FiscalIssueRequest, FiscalIssueResult, FiscalProviderConfig } from '../types';

export interface FiscalProvider {
  readonly name: string;
  configure(config: FiscalProviderConfig): void;
  issue(request: FiscalIssueRequest): Promise<FiscalIssueResult>;
  cancel(accessKey: string): Promise<FiscalIssueResult>;
}

export class FiscalProviderStub implements FiscalProvider {
  readonly name = 'stub';

  configure(_config: FiscalProviderConfig) {}

  async issue(request: FiscalIssueRequest): Promise<FiscalIssueResult> {
    return {
      status: 'PENDING',
      message: `Fiscal module not implemented. Sale ${request.saleId} queued for ${request.type}.`,
    };
  }

  async cancel(_accessKey: string): Promise<FiscalIssueResult> {
    return { status: 'PENDING', message: 'Fiscal cancel not implemented.' };
  }
}
