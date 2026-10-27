/** Expected failures translated into HTTP only by the transport layer. */

export class CampusError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'CampusError';
    this.status = status;
    this.message = message;
  }
}
