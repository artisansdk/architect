import type { Contract } from "../contract"

export default class NullLogger implements Contract {
    debug(_message: string, _context?: Record<string, unknown>): void {}
    info(_message: string, _context?: Record<string, unknown>): void {}
    notice(_message: string, _context?: Record<string, unknown>): void {}
    warn(_message: string, _context?: Record<string, unknown>): void {}
    error(_message: string, _context?: Record<string, unknown>): void {}
    critical(_message: string, _context?: Record<string, unknown>): void {}
    alert(_message: string, _context?: Record<string, unknown>): void {}
    emergency(_message: string, _context?: Record<string, unknown>): void {}
}
