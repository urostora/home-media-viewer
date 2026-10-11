# Nuxt & React Front-End Guidelines

- Prefer existing state and data flow before introducing a new pattern.
- Keep React components small, focused, and easy to reason about.
- Check the parent/child data flow before adding new prop drilling or context usage.
- For pages, review Nuxt lifecycle hooks and async behavior before changing mounted or created logic.
- Use the current routing conventions instead of creating custom route handling unless the task explicitly requires it.
- Before changing UI behavior, look for relevant tests in __tests__ and match the project’s existing patterns.