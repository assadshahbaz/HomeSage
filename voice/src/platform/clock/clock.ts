import { Injectable } from '@nestjs/common';

/** The current time, behind a class so tests can fix it. */
@Injectable()
export class Clock {
  public now(): Date {
    return new Date();
  }
}
