import { CharacteristicEventTypes } from 'homebridge';
import type {
  Service,
  PlatformAccessory,
  CharacteristicGetCallback,
} from 'homebridge';
import { Policy } from 'cockatiel';
import { Mutex } from 'async-mutex';

import { DingzDaHomebridgePlatform } from './platform';
import { MyStromDeviceInfo, MyStromPIRReport } from './util/myStromTypes';
import { DeviceInfo } from './util/commonTypes';
import { DeviceNotReachableError } from './util/errors';

// Policy for long running tasks, retry every hour
const retrySlow = Policy.handleAll()
  .orWhenResult((retry) => retry === true)
  .retry()
  .exponential({ initialDelay: 10000, maxDelay: 60 * 60 * 1000 });

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class MyStromPIRAccessory {
  private readonly mutex = new Mutex();
  private services: Service[] = [];
  private motionService: Service;
  private temperatureService: Service;
  private lightService: Service;

  // Eventually replaced by:
  private device: DeviceInfo;
  private mystromDeviceInfo: MyStromDeviceInfo;
  private baseUrl: string;

  private pirState = {
    motion: false,
    temperature: 0,
    light: 0,
  } as MyStromPIRReport;

  constructor(
    private readonly platform: DingzDaHomebridgePlatform,
    private readonly accessory: PlatformAccessory,
  ) {
    // Set Base URL
    this.device = this.accessory.context.device;
    this.mystromDeviceInfo = this.device.hwInfo as MyStromDeviceInfo;
    this.baseUrl = `http://${this.device.address}`;

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
        this.platform.Characteristic.AppMatchingIdentifier,
        'ch.mystrom.iOSApp',
      )
      .setCharacteristic(
        this.platform.Characteristic.Model,
        this.device.model as string,
      )
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, 'N/A')
      .setCharacteristic(
        this.platform.Characteristic.HardwareRevision,
        'PQWBB1',
      )
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        this.device.mac,
      );

    // get the LightBulb service if it exists, otherwise create a new LightBulb service
    // you can create multiple services for each accessory
    this.platform.log.info('Create Motion Sensor -> ', this.device.name);

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

    // Add the LightSensor that's integrated in the dingz
    // API: /api/v1/light
    this.lightService =
      this.accessory.getService(this.platform.Service.LightSensor) ??
      this.accessory.addService(this.platform.Service.LightSensor);

    this.lightService.setCharacteristic(
      this.platform.Characteristic.Name,
      'Light',
    );

    // create handlers for required characteristics
    this.lightService
      .getCharacteristic(this.platform.Characteristic.CurrentAmbientLightLevel)
      .on(CharacteristicEventTypes.GET, this.getLightLevel.bind(this));

    this.motionService =
      this.accessory.getService(this.platform.Service.MotionSensor) ??
      this.accessory.addService(this.platform.Service.MotionSensor);
    this.motionService.setCharacteristic(
      this.platform.Characteristic.Name,
      'Motion',
    );

    // Only check for motion if we have a PIR and set the Interval
    if (this.platform.config.motionPoller ?? true) {
      this.platform.log.info('Motion POLLING of', this.device.name, 'enabled');
      setInterval(() => {
        this.getDeviceReport()
          .then((report) => {
            if (report) {
              const isMotion: boolean = report.motion;
              // Only update if motionService exists *and* if there's a change in motion'
              if (this.pirState.motion !== isMotion) {
                this.platform.log.debug('Motion Update from POLLER');
                this.pirState.motion = isMotion;
                this.motionService.updateCharacteristic(
                  this.platform.Characteristic.MotionDetected,
                  this.pirState.motion,
                );
              }
              this.pirState.temperature = report.temperature;
              this.temperatureService.updateCharacteristic(
                this.platform.Characteristic.CurrentTemperature,
                this.pirState.temperature,
              );

              this.pirState.light = report.light ?? 0;
              this.lightService.updateCharacteristic(
                this.platform.Characteristic.CurrentAmbientLightLevel,
                this.pirState.light,
              );
            } else {
              throw new DeviceNotReachableError(
                `Device can not be reached ->
              ${this.device.name}-> ${this.device.address}`,
              );
            }
          })
          .catch((e: Error) => {
            this.platform.log.error(
              'Error -> unable to fetch DeviceMotion data',
              e.name,
              e.toString(),
            );
          });
      }, 2000); // Shorter term updates for motion sensor
    }

    // Set the callback URL (Override!)
    retrySlow.execute(() => {
      this.platform.setButtonCallbackUrl({
        baseUrl: this.baseUrl,
        token: this.device.token,
        endpoints: ['pir/generic'], // Buttons need the 'generic' endpoint specifically set
      });
    });
  }

  /**
   * Handle Handle the "GET" requests from HomeKit
   * to get the current value of the "Ambient Light Level" characteristic
   */
  private getLightLevel(callback: CharacteristicGetCallback) {
    const light: number = this.pirState?.light ?? 42;
    this.platform.log.debug(
      'Get Characteristic Ambient Light Level ->',
      light,
      ' lux',
    );

    callback(null, light);
  }

  /**
   * Handle Handle the "GET" requests from HomeKit
   * to get the current value of the "Temperature" characteristic
   */
  private getTemperature(callback: CharacteristicGetCallback) {
    const temperature: number = this.pirState?.temperature;
    this.platform.log.debug(
      'Get Characteristic Temperature ->',
      temperature,
      '° C',
    );

    callback(null, temperature);
  }

  /**
   * Handle Handle the "GET" requests from HomeKit
   * to get the current value of the "Motion Detected" characteristic
   */
  private getMotionDetected(callback: CharacteristicGetCallback) {
    // set this to a valid value for MotionDetected
    const isMotion = this.pirState.motion;
    callback(null, isMotion);
  }

  private async getDeviceReport(): Promise<MyStromPIRReport> {
    const getSensorsUrl = `${this.baseUrl}/api/v1/sensors`;
    const release = await this.mutex.acquire();
    try {
      return await this.platform.fetch({
        url: getSensorsUrl,
        returnBody: true,
        token: this.device.token,
      });
    } finally {
      release();
    }
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
}
