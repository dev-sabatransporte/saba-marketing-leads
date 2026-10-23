import { DomainException } from '../../../../infrastructure/errors/DomainException';

/** No assistant run sent this message. */
export class MessageExplanationNotFoundException extends DomainException {
  constructor() {
    super('ASSISTANT_MESSAGE_EXPLANATION_NOT_FOUND');
  }
}
