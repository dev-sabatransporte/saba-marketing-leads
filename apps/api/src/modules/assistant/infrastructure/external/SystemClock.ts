import { Injectable } from '@nestjs/common';
import type { ClockPort } from '../../application/ports/out/ClockPort';

@Injectable()
export class SystemClock implements ClockPort {
  now(): Date {
    return new Date();
  }
}
