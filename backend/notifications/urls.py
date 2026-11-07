from django.urls import path

from .notifications import NotificationArchiveView, NotificationsView

urlpatterns = [
    path("projects/<int:project_pk>/notifications/",
         NotificationsView.as_view()),
    path("projects/<int:project_pk>/notifications/<int:notif_pk>/archive/",
         NotificationArchiveView.as_view()),
]
