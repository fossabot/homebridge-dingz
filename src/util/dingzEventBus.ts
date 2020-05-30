import { EventEmitter } from 'events';
import { DingzAccessoryType, ButtonAction } from './commonTypes';
import { ButtonId } from './dingzTypes';

// Platform elements
// EVENT TYPES
export const enum DingzEvent {
  UPDATE_INFO = 'updateDingzInfo',
  BTN_PRESS = 'buttonPress',
  STATE_UPDATE = 'stateUpdate',
}

export declare interface DingzEventBus {
  on(
    event: DingzEvent.BTN_PRESS,
    listener: (mac: string, action: ButtonAction, battery: number) => void,
  ): this;
  on(
    event: DingzEvent.BTN_PRESS,
    listener: (mac: string, action: ButtonAction, button: ButtonId) => void,
  ): this;
  on(
    event: DingzEvent.UPDATE_INFO,
    listener: (accessory: DingzAccessoryType) => void,
  ): this;
  on(event: DingzEvent.STATE_UPDATE, listener: () => void): this;

  emit(
    event: DingzEvent.BTN_PRESS,
    mac: string,
    action: ButtonAction,
    battery: number,
  ): boolean;
  emit(
    event: DingzEvent.BTN_PRESS,
    mac: string,
    action: ButtonAction,
    button: ButtonId,
  ): boolean;
  emit(event: DingzEvent.UPDATE_INFO, accessory: DingzAccessoryType): boolean;
  emit(event: DingzEvent.STATE_UPDATE): boolean;
}

export class DingzEventBus extends EventEmitter {
  constructor() {
    super();
  }
}
