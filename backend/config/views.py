import logging
import time

from django.core.cache import cache
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["GET"])
def health_check(request):
    """Comprehensive health check endpoint for monitoring"""
    health_data = {
        "status": "healthy",
        "service": "writerverse-backend",
        "version": "1.0.0",
        "timestamp": time.time(),
        "checks": {}
    }

    # Database health check
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            health_data["checks"]["database"] = "healthy"
    except Exception:
        # The details go to our logs only: the caller is anyone on the internet.
        logger.exception("Health check: database failed")
        health_data["checks"]["database"] = "unhealthy"
        health_data["status"] = "degraded"

    # Cache health check
    try:
        cache.set("health_check", "ok", timeout=10)
        if cache.get("health_check") == "ok":
            health_data["checks"]["cache"] = "healthy"
        else:
            health_data["checks"]["cache"] = "unhealthy: no response"
            health_data["status"] = "degraded"
    except Exception:
        logger.exception("Health check: cache failed")
        health_data["checks"]["cache"] = "unhealthy"
        health_data["status"] = "degraded"

    return JsonResponse(health_data, status=200 if health_data["status"] == "healthy" else 503)


@csrf_exempt
@require_http_methods(["GET"])
def root(request):
    """Root endpoint with API information"""
    return JsonResponse({
        "message": "Welcome to WriterVerse API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health/",
            "api": "/api/",
        }
    })
