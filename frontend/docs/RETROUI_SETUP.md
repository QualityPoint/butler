# RetroUI Integration in Butler

RetroUI has been successfully integrated into the Butler frontend! 🎨

## What's Installed

✅ **Tailwind CSS v4** - Utility-first CSS framework  
✅ **Shadcn/ui** - Base component system  
✅ **RetroUI Theme** - NeoBrutalist design with bold borders and colors  
✅ **RetroUI Button** - First component installed

## Design System

### Colors

- **Primary**: Yellow (`#ffdb33`) - Main brand color
- **Background**: White/Dark (`#fff` / `#1a1a1a`)
- **Accent**: Light yellow (`#fae583`)
- **Border**: Black/Dark gray (`#000` / `#3a3a3a`)

### Typography

- **Headings**: Archivo Black (bold, retro-style)
- **Body**: Space Grotesk (modern, clean)

### Shadows

RetroUI uses offset shadows for that signature NeoBrutalist look:

- `shadow-xs` to `shadow-2xl` - Increasing offset shadows
- All shadows use `var(--border)` color

## Using RetroUI Components

### Installing Components

```bash
# Install any RetroUI component
npx shadcn@latest add 'https://retroui.dev/r/[component].json'

# Examples:
npx shadcn@latest add 'https://retroui.dev/r/badge.json'
npx shadcn@latest add 'https://retroui.dev/r/avatar.json'
npx shadcn@latest add 'https://retroui.dev/r/input.json'
npx shadcn@latest add 'https://retroui.dev/r/alert.json'
```

### Using in Components

```tsx
import { Button } from "@/components/retroui/Button";

function MyComponent() {
  return (
    <div>
      <Button>Primary</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="destructive">Delete</Button>
    </div>
  );
}
```

## Available Components

From [retroui.dev](https://retroui.dev/docs/components/button):

- **Button** ✅ (Installed)
- Badge
- Avatar
- Accordion
- Alert
- Input & Textarea
- Card
- Dialog
- Dropdown Menu
- Tabs
- And many more...

## Customization

All theme variables are in `src/index.css`:

```css
:root {
  --radius: 0; /* Border radius (0 for sharp corners) */
  --background: #fff;
  --primary: #ffdb33; /* Change brand color */
  --border: #000; /* Border color */
  /* ... more variables */
}
```

## Dark Mode

RetroUI includes dark mode support. The `.dark` class automatically switches colors:

```tsx
// Toggle dark mode
document.documentElement.classList.toggle("dark");
```

## Resources

- **Documentation**: https://www.retroui.dev/docs
- **Components**: https://www.retroui.dev/docs/components/button
- **Themes**: https://www.retroui.dev/themes
- **GitHub**: https://github.com/Logging-Stuff/retroui

## Next Steps

1. Install more components as needed
2. Build your dashboard layout
3. Customize colors in `index.css`
4. Explore RetroUI Pro for advanced blocks and templates

Enjoy building with RetroUI! 🚀
