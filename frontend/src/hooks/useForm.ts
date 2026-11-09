import React from 'react'
/**
 * Custom hook for form handling with validation
 * Eliminates duplication across LoginPage, SignupPage, and other forms
 */
import { useState, useEffect } from 'react'

export interface FormField {
  name: string
  value: string
  required?: boolean
  minLength?: number
  maxLength?: number
  pattern?: RegExp
  customValidator?: (value: string) => string | null
}

export interface FormConfig {
  fields: FormField[]
  onSubmit: (data: Record<string, string>) => Promise<void> | void
  onError?: (error: unknown) => void
  clearErrorOnChange?: boolean
  clearErrorOnMount?: boolean
}

export interface UseFormReturn {
  formData: Record<string, string>
  validationErrors: Record<string, string>
  isLoading: boolean
  error: string | null
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleSubmit: (e: React.FormEvent) => Promise<void>
  validateForm: () => boolean
  clearError: () => void
  setFormData: (data: Record<string, string>) => void
  setValidationErrors: (errors: Record<string, string>) => void
}

export function useForm(config: FormConfig): UseFormReturn {
  const { fields, onSubmit, onError, clearErrorOnChange = true, clearErrorOnMount = true } = config
  
  // Initialize form data
  const initialData = fields.reduce((acc, field) => {
    acc[field.name] = field.value || ''
    return acc
  }, {} as Record<string, string>)
  
  const [formData, setFormData] = useState<Record<string, string>>(initialData)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Clear error on mount if specified
  useEffect(() => {
    if (clearErrorOnMount) {
      setError(null)
    }
  }, [clearErrorOnMount])

  const validateField = (field: FormField, value: string): string | null => {
    // Required validation
    if (field.required && !value.trim()) {
      return `${field.name.charAt(0).toUpperCase() + field.name.slice(1)} is required`
    }

    // Skip other validations if field is empty and not required
    if (!value.trim() && !field.required) {
      return null
    }

    // Length validations
    if (field.minLength && value.length < field.minLength) {
      return `${field.name.charAt(0).toUpperCase() + field.name.slice(1)} must be at least ${field.minLength} characters`
    }

    if (field.maxLength && value.length > field.maxLength) {
      return `${field.name.charAt(0).toUpperCase() + field.name.slice(1)} must be no more than ${field.maxLength} characters`
    }

    // Pattern validation
    if (field.pattern && !field.pattern.test(value)) {
      return `Please enter a valid ${field.name}`
    }

    // Custom validation
    if (field.customValidator) {
      return field.customValidator(value)
    }

    return null
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}
    
    fields.forEach(field => {
      const fieldError = validateField(field, formData[field.name])
      if (fieldError) {
        errors[field.name] = fieldError
      }
    })

    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    
    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }))
    }
    
    // Clear general error when user starts typing
    if (clearErrorOnChange && error) {
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) return
    
    setIsLoading(true)
    setError(null)
    
    try {
      await onSubmit(formData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An error occurred'
      setError(errorMessage)
      if (onError) {
        onError(err)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const clearError = () => setError(null)

  return {
    formData,
    validationErrors,
    isLoading,
    error,
    handleInputChange,
    handleSubmit,
    validateForm,
    clearError,
    setFormData,
    setValidationErrors
  }
}

// Common validation patterns
export const ValidationPatterns = {
  email: /\S+@\S+\.\S+/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/,
  name: /^[a-zA-Z\s]+$/,
  phone: /^\+?[\d\s\-()]+$/
}

// Common field configurations
export const CommonFields = {
  email: {
    name: 'email',
    required: true,
    pattern: ValidationPatterns.email,
    customValidator: (value: string) => {
      if (!ValidationPatterns.email.test(value)) {
        return 'Please enter a valid email address'
      }
      return null
    }
  },
  password: {
    name: 'password',
    required: true,
    minLength: 8,
    customValidator: (value: string) => {
      if (value.length < 8) {
        return 'Password must be at least 8 characters'
      }
      return null
    }
  },
  firstName: {
    name: 'firstName',
    required: true,
    pattern: ValidationPatterns.name,
    customValidator: (value: string) => {
      if (!ValidationPatterns.name.test(value)) {
        return 'First name can only contain letters and spaces'
      }
      return null
    }
  },
  lastName: {
    name: 'lastName',
    required: true,
    pattern: ValidationPatterns.name,
    customValidator: (value: string) => {
      if (!ValidationPatterns.name.test(value)) {
        return 'Last name can only contain letters and spaces'
      }
      return null
    }
  },
  passwordConfirm: (password: string) => ({
    name: 'passwordConfirm',
    required: true,
    customValidator: (value: string) => {
      if (value !== password) {
        return 'Passwords do not match'
      }
      return null
    }
  })
}








