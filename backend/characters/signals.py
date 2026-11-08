"""Remove a character's portrait file when its row is really deleted.

A soft delete (the 10-second Undo) keeps the row, so it keeps the file too.
A hard delete (the character's project being deleted, or a direct
`all_objects...delete()`) removes the file after the delete commits.
"""
from __future__ import annotations

from django.db import transaction
from django.db.models.signals import post_delete
from django.dispatch import receiver

from characters.models import Character
from characters.portraits import delete_portrait


@receiver(post_delete, sender=Character, dispatch_uid="character_portrait_file_delete")
def delete_portrait_file(sender, instance: Character, **kwargs) -> None:
    url = instance.portrait_url
    if url:
        transaction.on_commit(lambda: delete_portrait(url))
