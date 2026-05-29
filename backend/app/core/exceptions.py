from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse

class AppError(Exception):
    def __init__(self, message: str, status_code: int):
        self.message = message
        self.status_code = status_code

class NotFoundError(AppError):
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, status.HTTP_404_NOT_FOUND)

class UnauthorizedError(AppError):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message, status.HTTP_401_UNAUTHORIZED)

class ForbiddenError(AppError):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(message, status.HTTP_403_FORBIDDEN)

class ValidationError(AppError):
    def __init__(self, message: str = "Validation error"):
        super().__init__(message, status.HTTP_422_UNPROCESSABLE_ENTITY)

class ScrapingError(AppError):
    def __init__(self, message: str = "Scraping failed"):
        super().__init__(message, status.HTTP_500_INTERNAL_SERVER_ERROR)

class AgentError(AppError):
    def __init__(self, message: str = "Agent execution failed"):
        super().__init__(message, status.HTTP_500_INTERNAL_SERVER_ERROR)

async def app_error_handler(request: Request, exc: AppError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.message},
    )
