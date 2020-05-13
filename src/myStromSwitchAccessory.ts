import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicValue,
  CharacteristicSetCallback,
  CharacteristicGetCallback,
} from 'homebridge';

import { DingzDaHomebridgePlatform } from './platform';
import {
  DeviceInfo,
  MyStromDeviceInfo,
  MyStromSwitchReport,
} from './util/internalTypes';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MyStromSwitchAccessory {
  private outletService: Service;
  private temperatureService: Service | undefined = undefined;

  // Eventually replaced by:
  private switchOn = false;
  private device: DeviceInfo;
  private mystromDeviceInfo: MyStromDeviceInfo;
  private baseUrl: string;
  /**
   * These are just used to create a working example
   * You should implement your own code to track the state of your accessory
   */
  private outletState = {
    relay: false,
    temperature: 0,
    power: 0,
  } as MyStromSwitchReport;

  constructor(
    private readonly platform: DingzDaHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set Base URL
    this.device = this.accessory.context.device;
    this.mystromDeviceInfo = this.device.hwInfo as MyStromDeviceInfo;
    this.baseUrl = 'http://' + this.device.address;
    /*
     * ID Gneration for the various Accessories in the myStrom / Dingz Universe:
     * DINGZ Dimmer: [MAC]-D[0-3] for Dimmer 1-4
     * DINGZ PIR: [MAC]-PIR
     * DINGZ Temperature: [MAC]-T
     * DINGZ Motion Sensor: [MAC]-M
     * DINGZ Blinds/Shades: [MAC]-BD[0-1] for Blinds 1/2
     * DINGZ Button: [MAC]-BT[0-3] for Button 1/4
     */

    this.platform.log.debug(
      'Setting informationService Characteristics ->',
      this.device.model,
    );
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'MyStrom AG',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.device.model as string,
      )
      .setCharacteristic(
        this.platform.Characteristic.FirmwareRevision,
        this.mystromDeviceInfo.version ?? 'N/A',
      )
      .setCharacteristic(
        this.platform.Characteristic.HardwareRevision,
        this.mystromDeviceInfo ? 'EU/CH v2' : 'CH v1',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.device.mac,
      );

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.outletService =
      this.accessory.getService(this.platform.Service.Outlet) ??
      this.accessory.addService(this.platform.Service.Outlet);

    // To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
    // when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
    // this.accessory.getService('NAME') ?? this.accessory.addService(this.platform.Service.Lightbulb, 'NAME', 'USER_DEFINED_SUBTYPE');

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.outletService.setCharacteristic(
      this.platform.Characteristic.Name,
      `${accessory.context.device.model} Outlet`,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Lightbulb

    // register handlers for the On/Off Characteristic
    this.outletService
      .getCharacteristic(this.platform.Characteristic.On)
      .on(CharacteristicEventTypes.SET, this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOn.bind(this)); // GET - bind to the `getOn` method below

    this.outletService
      .getCharacteristic(this.platform.Characteristic.OutletInUse)
      //      .on(CharacteristicEventTypes.SET, this.setOutletInUse.bind(this)) // SET - bind to the `setOn` method below
      .on(CharacteristicEventTypes.GET, this.getOutletInUse.bind(this)); // GET - bind to the `getOn` method below

    if(this.device.hwInfo?.type !== undefined) {

      // Dingz has a temperature sensor, make it available here
      // create a new Temperature Sensor service
      this.temperatureService =
            this.accessory.getService(this.platform.Service.TemperatureSensor) ??
            this.accessory.addService(this.platform.Service.TemperatureSensor);
      this.temperatureService.setCharacteristic(
        this.platform.Characteristic.Name,
        'Temperature',
      );
      
      // create handlers for required characteristics
      this.temperatureService
        .getCharacteristic(this.platform.Characteristic.CurrentTemperature)
        .on(CharacteristicEventTypes.GET, this.getTemperature.bind(this));
    }

    // EXAMPLE ONLY
    // Example showing how to update the state of a Characteristic asynchronously instead
    // of using the `on('get')` handlers.
    //
    // Here we change update the brightness to a random value every 5 seconds using
    // the `updateCharacteristic` method.
    setInterval(() => {
      this.getDeviceReport()
        .then((report) => {
          // push the new value to HomeKit
          this.outletState = report;
          this.outletService
            .updateCharacteristic(
              this.platform.Characteristic.On,
              this.outletState.relay,
            )
            .updateCharacteristic(
              this.platform.Characteristic.OutletInUse,
              (this.outletState.power > 0),
            );

          if(this.temperatureService) {
            this.temperatureService.updateCharacteristic(
              this.platform.Characteristic.CurrentTemperature,
              this.outletState.temperature,
            );
          }

          this.platform.log.debug(
            'Pushed updated current Outlet state to HomeKit ->', this.outletState,
          );
        })
        .catch((e) => {
          this.platform.log.debug('Error while retrieving Device Report ->', e);
        });
    }, 2000);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.platform.log.debug(
      'Identify! -> Who am I? I am',
      this.accessory.displayName,
    );
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  setOn(value: CharacteristicValue, callback: CharacteristicSetCallback) {
    // implement your own code to turn your device on/off
    this.platform.log.debug('Set Characteristic On ->', value);
    this.outletState.relay = value as boolean;
    this.setDeviceState(this.outletState.relay);
    
    /*
         .catch((e) => {
           this.platform.log.debug('Error updating Device ->', e.name);
         });
     */
    // you must call the callback function
    callback(null);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  getOn(callback: CharacteristicGetCallback) {
    // implement your own code to check if the device is on
    const isOn = this.outletState.relay;
    this.platform.log.debug('Get Characteristic On ->', isOn);

    callback(null, isOn);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getTemperature(callback: CharacteristicGetCallback) {
    // implement your own code to check if the device is on
    const temperature: number = this.outletState.temperature;
    this.platform.log.debug(
      'Get Characteristic Temperature ->',
      temperature,
      '° C',
    );

    callback(null, temperature);
  }

  /**
   * Handle the "GET" requests from HomeKit
   */
  private getOutletInUse(callback: CharacteristicGetCallback) {
    // implement your own code to check if the device is on
    const inUse: boolean = this.outletState.power > 0;
    this.platform.log.debug('Get Characteristic OutletInUse ->', inUse);
    callback(null, inUse);
  }

  private setDeviceState(isOn: boolean) {
    const relayUrl = `${this.baseUrl}/relay?state=${isOn ? '1' : '0'}`;
    this.platform.fetch({
      url: relayUrl,
      token: this.device.token,
    });
  }

  private async getDeviceReport(): Promise<MyStromSwitchReport> {
    const reportUrl = `${this.baseUrl}/report`;
    return await this.platform.fetch({
      url: reportUrl,
      returnBody: true,
      token: this.device.token,
    });
  }
}
