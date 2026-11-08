from django.urls import path

from .stream import (
    ChatStreamView,
    FrameView,
    PendingProposalsView,
    PingAnswerView,
    ThreadListView,
    ThreadMessagesView,
)

urlpatterns = [
    path(
        'projects/<int:project_pk>/chat/',
        ChatStreamView.as_view(),
        name='consistency-chat',
    ),
    path(
        'projects/<int:project_pk>/threads/',
        ThreadListView.as_view(),
        name='consistency-threads',
    ),
    path(
        'projects/<int:project_pk>/threads/<uuid:thread_id>/messages/',
        ThreadMessagesView.as_view(),
        name='consistency-thread-messages',
    ),
    path(
        'projects/<int:project_pk>/frame/',
        FrameView.as_view(),
        name='consistency-frame',
    ),
    path(
        'projects/<int:project_pk>/ping-answer/',
        PingAnswerView.as_view(),
        name='consistency-ping-answer',
    ),
    path(
        'projects/<int:project_pk>/pending-proposals/',
        PendingProposalsView.as_view(),
        name='consistency-pending-proposals',
    ),
]
