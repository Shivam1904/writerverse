"""
HTML Sanitization Utilities
Provides safe HTML sanitization for user content to prevent XSS attacks
"""

import bleach


class HTMLSanitizer:
    """
    HTML sanitizer with configurable allowed tags and attributes
    """

    # Allowed HTML tags for rich text content
    ALLOWED_TAGS = [
        'p', 'br', 'strong', 'em', 'u', 'b', 'i', 's', 'strike',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
        'a', 'img', 'div', 'span',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'hr'
    ]

    # Allowed attributes for specific tags
    ALLOWED_ATTRIBUTES = {
        'a': ['href', 'title', 'target'],
        'img': ['src', 'alt', 'title', 'width', 'height'],
        'div': ['class', 'id'],
        'span': [
            'class',
            'id',
            'data-id',
            'data-label',
            'data-entity-id',
            'data-entity-type',
            'data-entity-label',
            'data-entities',
            'data-type',
            'data-mention-suggestion-char',
        ],
        'p': ['class'],
        'h1': ['class'], 'h2': ['class'], 'h3': ['class'],
        'h4': ['class'], 'h5': ['class'], 'h6': ['class'],
        'table': ['class', 'border', 'cellpadding', 'cellspacing'],
        'th': ['colspan', 'rowspan'], 'td': ['colspan', 'rowspan'],
        'pre': ['class'], 'code': ['class']
    }

    # Allowed URL schemes
    ALLOWED_PROTOCOLS = ['http', 'https', 'mailto']

    @classmethod
    def sanitize_html(cls, content: str | None) -> str | None:
        """
        Sanitize HTML content to prevent XSS attacks

        Args:
            content: HTML content to sanitize

        Returns:
            Sanitized HTML content or None if input is None
        """
        if not content:
            return content

        # Clean the HTML content
        cleaned = bleach.clean(
            content,
            tags=cls.ALLOWED_TAGS,
            attributes=cls.ALLOWED_ATTRIBUTES,
            protocols=cls.ALLOWED_PROTOCOLS,
            strip=True,  # Remove disallowed tags completely
            strip_comments=True  # Remove HTML comments
        )

        return cleaned

    @classmethod
    def sanitize_plain_text(cls, content: str | None) -> str | None:
        """
        Sanitize content by stripping all HTML tags (for plain text fields)

        Args:
            content: Content to sanitize

        Returns:
            Plain text content or None if input is None
        """
        if not content:
            return content

        # Strip all HTML tags
        cleaned = bleach.clean(content, tags=[], strip=True)
        return cleaned

    @classmethod
    def sanitize_rich_text(cls, content: str | None) -> str | None:
        """
        Sanitize rich text content (allows basic formatting)

        Args:
            content: Rich text content to sanitize

        Returns:
            Sanitized rich text content or None if input is None
        """
        return cls.sanitize_html(content)

    @classmethod
    def sanitize_markdown(cls, content: str | None) -> str | None:
        """
        Sanitize markdown content (strips HTML but preserves markdown syntax)

        Args:
            content: Markdown content to sanitize

        Returns:
            Sanitized markdown content or None if input is None
        """
        if not content:
            return content

        # For markdown, we strip HTML but preserve markdown syntax
        cleaned = bleach.clean(content, tags=[], strip=True)
        return cleaned


def sanitize_content_field(content: str | None, field_type: str = 'rich_text') -> str | None:
    """
    Convenience function to sanitize content based on field type

    Args:
        content: Content to sanitize
        field_type: Type of content ('rich_text', 'plain_text', 'markdown')

    Returns:
        Sanitized content
    """
    if field_type == 'rich_text':
        return HTMLSanitizer.sanitize_rich_text(content)
    elif field_type == 'plain_text':
        return HTMLSanitizer.sanitize_plain_text(content)
    elif field_type == 'markdown':
        return HTMLSanitizer.sanitize_markdown(content)
    else:
        # Default to plain text sanitization for unknown types
        return HTMLSanitizer.sanitize_plain_text(content)
