import { DomainException } from '../../../../infrastructure/errors/DomainException';

/** The message was not sent by the assistant, or its run was already purged. */
export class MessageExplanationNotFoundException extends DomainException {
  constructor() {
    super('ASSISTANT_MESSAGE_EXPLANATION_NOT_FOUND');
  }
}
