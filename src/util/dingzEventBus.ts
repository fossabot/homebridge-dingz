import { EventEmitter } from 'events';
import { AccessoryType, ButtonAction } from './commonTypes';
import { ButtonId } from './dingzTypes';

// Platform elements
// EVENT TYPES
export const enum DingzEvent {
  UPDATE_INFO = 'updateDingzInfo',
  ACTION = 'deviceAction',
  STATE_UPDATE = 'stateUpdate',
}

export declare interface DingzEventBus {
  on(
    event: DingzEvent.ACTION,
    listener: (mac: string, action: ButtonAction, battery: number) => void,
  ): this;
  on(
    event: DingzEvent.ACTION,
    listener: (mac: string, action: ButtonAction, button: ButtonId) => void,
  ): this;
  on(
    event: DingzEvent.UPDATE_INFO,
    listener: (accessory: AccessoryType) => void,
  ): this;
  on(event: DingzEvent.STATE_UPDATE, listener: () => void): this;

  emit(
    event: DingzEvent.ACTION,
    mac: string,
    action: ButtonAction,
    battery: number,
  ): boolean;
  emit(
    event: DingzEvent.ACTION,
    mac: string,
    action: ButtonAction,
    button: ButtonId,
  ): boolean;
  emit(event: DingzEvent.UPDATE_INFO, accessory: AccessoryType): boolean;
  emit(event: DingzEvent.STATE_UPDATE): boolean;
}

export class DingzEventBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // Maximum of 20 services
  }
}
