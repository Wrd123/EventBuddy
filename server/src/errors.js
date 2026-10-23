// An error with an HTTP status and a message that is safe to show users.
// Route handlers throw these; the error handler turns them into responses.
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { HttpError };
