// The slice of the Web Bluetooth API the Sniffer page uses. TypeScript's DOM
// lib doesn't ship these types (the API is Chromium-only), and pulling in
// @types/web-bluetooth for five interfaces isn't worth a dependency.

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  readonly value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  stopNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValueWithResponse(value: BufferSource): Promise<void>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(uuid: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTServer {
  readonly connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(uuid: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothDevice extends EventTarget {
  readonly name?: string;
  readonly gatt?: BluetoothRemoteGATTServer;
}

interface RequestDeviceOptions {
  filters: Array<{ services?: string[]; namePrefix?: string }>;
  optionalServices?: string[];
}

interface Bluetooth {
  getAvailability(): Promise<boolean>;
  requestDevice(options: RequestDeviceOptions): Promise<BluetoothDevice>;
}

interface Navigator {
  readonly bluetooth?: Bluetooth;
}
