import { DomainException } from '../../../../infrastructure/errors/DomainException';

export class MaxWaitBelowDebounceException extends DomainException {
  constructor() {
    super('ASSISTANT_MAX_WAIT_BELOW_DEBOUNCE');
  }
}
