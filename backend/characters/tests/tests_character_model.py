"""
Tests for Character model validation and functionality.
"""
from django.contrib.auth import get_user_model
from django.test import TestCase
from projects.models import Project

from characters.models import CHARACTER_COLOR_SHADES, Character

User = get_user_model()


class CharacterModelTestCase(TestCase):
    """Test Character model validation and methods"""

    def setUp(self):
        self.user = User.objects.create_user(
            email='test@example.com',
            password='testpass123'
        )
        self.project = Project.objects.create(
            title='Test Project',
            user=self.user
        )

    def test_create_character(self):
        """Test basic character creation"""
        character = Character.objects.create(
            project=self.project,
            name='Hero',
            type='protagonist',
            story='A hero journey',
            want='To save the world',
            need='To overcome fear'
        )
        self.assertEqual(character.name, 'Hero')
        self.assertEqual(character.project, self.project)
        self.assertEqual(character.type, 'protagonist')

    def test_character_str(self):
        """Test character string representation"""
        character = Character.objects.create(
            project=self.project,
            name='My Character'
        )
        self.assertIn('My Character', str(character))

    def test_color_auto_assigned_and_cycles(self):
        """New characters auto-take distinct blue-family shades, cycled by count."""
        shades = CHARACTER_COLOR_SHADES
        made = [
            Character.objects.create(project=self.project, name=f'C{i}')
            for i in range(len(shades) + 1)
        ]
        # First N follow the palette order; then it wraps around.
        for i, ch in enumerate(made):
            self.assertEqual(ch.color, shades[i % len(shades)])

    def test_color_override_survives(self):
        """An explicitly-set colour is never overwritten by auto-assignment."""
        ch = Character.objects.create(
            project=self.project, name='Custom', color='var(--asp-items)'
        )
        self.assertEqual(ch.color, 'var(--asp-items)')

    def test_character_status_choices(self):
        """Test character status field"""
        character = Character.objects.create(
            project=self.project,
            name='Status Character',
            status='active'
        )
        self.assertEqual(character.status, 'active')

    def test_boolean_fields(self):
        """Test is_main_character, is_protagonist, is_antagonist fields"""
        character = Character.objects.create(
            project=self.project,
            name='Main Hero',
            is_main_character=True,
            is_protagonist=True,
            is_antagonist=False
        )
        self.assertTrue(character.is_main_character)
        self.assertTrue(character.is_protagonist)
        self.assertFalse(character.is_antagonist)

    def test_permanent_traits_json(self):
        """Test permanent_traits JSON field"""
        traits = {'brave': True, 'kind': True}
        character = Character.objects.create(
            project=self.project,
            name='Traits Character',
            permanent_traits=traits
        )
        self.assertEqual(character.permanent_traits['brave'], True)

    def test_evolving_states_json(self):
        """Test evolving_states JSON field"""
        states = {'confidence': 'growing'}
        character = Character.objects.create(
            project=self.project,
            name='States Character',
            evolving_states=states
        )
        self.assertEqual(character.evolving_states['confidence'], 'growing')

    def test_voice_profile_json(self):
        """Test voice_profile JSON field"""
        profile = {'tone': 'optimistic', 'pace': 'fast'}
        character = Character.objects.create(
            project=self.project,
            name='Voice Character',
            voice_profile=profile
        )
        self.assertEqual(character.voice_profile['tone'], 'optimistic')
