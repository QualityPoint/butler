# Butler Frontend Documentation

Welcome to the Butler frontend documentation! This directory contains comprehensive guides for working with the Butler React application.

## � Quick Start

**New to Butler?** Start here:
1. **[Quick Reference](QUICK_REFERENCE.md)** - Cheat sheet for common operations
2. **[Error Handling](ERROR_HANDLING.md)** - Essential patterns for handling errors
3. **[Frappe Integration](FRAPPE_INTEGRATION.md)** - Understanding the backend connection

## �📖 Available Documentation
### Quick Reference

**[Quick Reference Card](QUICK_REFERENCE.md)** ⚡  
Cheat sheet with code snippets for common operations - error handling, API calls, UI components, and development commands.
### Core Guides

**[Error Handling](ERROR_HANDLING.md)** 🎯  
Complete guide to the error handling system including toast notifications, error banners, and integration with frappe-react-sdk. Start here to learn how to handle errors consistently across the app.

**[Frappe Integration](FRAPPE_INTEGRATION.md)** 🔌  
Details on how the Butler frontend connects to the Frappe backend, including authentication, routing, and API integration.

**[Frappe React Integration Guide](FRAPPE_REACT_INTEGRATION_GUIDE.md)** 📚  
Step-by-step comprehensive guide for integrating React with Frappe Framework. Use this as a reference for any Frappe + React project.

**[RetroUI Setup](RETROUI_SETUP.md)** 🎨  
Design system documentation covering the NeoBrutalist RetroUI theme, components, customization, and usage.

### Data Reference

**[Packages.csv](Packages.csv)** 📊  
Service categories and items data structure for the butler system (Comfort, Hospitality, Efficient, Entertainment, Security).

---

## 🚀 Quick Links

### Getting Started
1. [Set up error handling](ERROR_HANDLING.md#quick-start) - Learn toast and banner patterns
2. [Understand Frappe integration](FRAPPE_INTEGRATION.md#architecture-overview) - Backend connection
3. [Use RetroUI components](RETROUI_SETUP.md#using-retroui-components) - Design system

### Common Tasks
- **Handle API errors**: See [Error Handling](ERROR_HANDLING.md#usage-examples)
- **Make API calls**: See [Frappe Integration](FRAPPE_INTEGRATION.md#api-integration)
- **Add UI components**: See [RetroUI Setup](RETROUI_SETUP.md#available-components)
- **Authenticate users**: See [Frappe Integration](FRAPPE_INTEGRATION.md#authentication-flow)

---

## 🏗️ Project Structure

```
butler/frontend/
├── docs/              # 📚 This directory
├── src/
│   ├── lib/           # Utilities and helpers
│   │   ├── errorHandler.ts
│   │   └── errors.ts
│   ├── components/    # React components
│   │   ├── ui/        # Reusable UI components
│   │   ├── auth/      # Authentication components
│   │   └── service/   # Service-specific components
│   ├── pages/         # Page components
│   ├── contexts/      # React contexts
│   └── examples/      # Code examples
└── README.md          # Main readme
```

---

## 💡 Need Help?

1. **Check the relevant guide** in this directory
2. **Review code examples** in `/src/examples/`
3. **Inspect working implementations** in `/src/pages/` and `/src/components/`

---

**Last Updated**: February 2026
