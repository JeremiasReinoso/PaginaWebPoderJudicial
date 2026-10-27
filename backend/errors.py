"""Expected failures translated into HTTP only by the transport layer."""


class CampusError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message
