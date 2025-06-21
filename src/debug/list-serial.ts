import { SerialPort } from 'serialport';

const ports = await SerialPort.list();
console.log(ports.map((port) => port.path));
