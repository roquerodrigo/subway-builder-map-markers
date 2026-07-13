// Tagged console logging so every mod message is greppable as "[MapMarkers]".
export class Logger {
  constructor(private readonly tag: string) {}

  error(...args: unknown[]): void {
    console.error(this.tag, ...args)
  }

  log(...args: unknown[]): void {
    console.log(this.tag, ...args)
  }

  warn(...args: unknown[]): void {
    console.warn(this.tag, ...args)
  }
}

export const logger = new Logger('[MapMarkers]')
