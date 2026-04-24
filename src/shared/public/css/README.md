# Exprsn Dashboard CSS

Professional, production-ready CSS stylesheet for the Exprsn dashboard system with comprehensive component styling and dark theme support.

## File Information

- **Location**: `/src/exprsn-svr/lowcode/public/css/exprsn-dashboard.css`
- **Size**: 43 KB
- **Lines**: 1,980
- **Format**: Pure CSS3 with CSS Custom Properties (Variables)
- **Compatibility**: All modern browsers (Chrome, Firefox, Safari, Edge)

## Features

### Color System
- WCAG AA compliant color palette
- 5 primary color variations (primary, hover, light, dark, glow)
- Semantic colors (success, danger, warning, info)
- 12-step neutral gray scale
- Light and dark theme support

### Components Included

1. **Navbar** - Fixed top navigation with search and user menu
2. **Sidebar** - Collapsible navigation with sections and badges
3. **Buttons** - Primary, secondary, outline, success, danger variants
4. **Cards** - Standard, header/body/footer, stats cards
5. **Tables** - Sortable headers, draggable rows, action buttons
6. **Forms** - Inputs, textareas, selects, checkboxes, toggles
7. **Modals** - Overlay dialogs with animations
8. **Alerts** - Success, warning, danger, info variants
9. **Badges & Tabs** - Various status indicators and navigation
10. **Progress Bars** - Animated and striped variants
11. **Pagination** - Page link buttons
12. **Spinners** - Loading indicators
13. **Tooltips** - Data-attribute based tooltips
14. **Grid Layouts** - Responsive grid utilities

### Advanced Features

- **CSS Custom Properties** (Variables) for easy theming
- **Dark Theme Support** - Built-in dark mode via `[data-theme="dark"]`
- **Animations** - Smooth transitions and keyframe animations
- **Responsive Design** - Mobile-first approach with breakpoints at 768px and 1200px
- **Accessibility** - Focus states, high contrast options, semantic HTML support
- **Performance** - No external dependencies, pure CSS, efficient selectors

## Usage

### Basic Import

```html
<link rel="stylesheet" href="/css/exprsn-dashboard.css">
```

### Using CSS Variables

```css
/* Access predefined colors */
color: var(--exprsn-primary);
background: var(--exprsn-bg-primary);
border: 1px solid var(--exprsn-border-color);
```

### Enabling Dark Theme

```html
<!-- Add data-theme attribute to root element -->
<html data-theme="dark">
```

Or with JavaScript:

```javascript
document.documentElement.setAttribute('data-theme', 'dark');
document.documentElement.removeAttribute('data-theme'); // Reset to light
```

### Available CSS Variables

#### Colors
- `--exprsn-primary`, `--exprsn-primary-hover`, `--exprsn-primary-light`, `--exprsn-primary-dark`
- `--exprsn-secondary`, `--exprsn-secondary-hover`, `--exprsn-secondary-light`, `--exprsn-secondary-dark`
- `--exprsn-accent-pink`, `--exprsn-accent-orange`, `--exprsn-accent-green`, `--exprsn-accent-cyan`, `--exprsn-accent-yellow`
- `--exprsn-success`, `--exprsn-success-hover`, `--exprsn-success-bg`
- `--exprsn-danger`, `--exprsn-danger-hover`, `--exprsn-danger-bg`
- `--exprsn-warning`, `--exprsn-warning-hover`, `--exprsn-warning-bg`
- `--exprsn-info`, `--exprsn-info-hover`, `--exprsn-info-bg`
- `--exprsn-text-primary`, `--exprsn-text-secondary`, `--exprsn-text-muted`, `--exprsn-text-inverse`
- `--exprsn-bg-primary`, `--exprsn-bg-secondary`, `--exprsn-bg-tertiary`
- `--exprsn-border-color`, `--exprsn-border-color-strong`

#### Sizing
- `--exprsn-radius-sm`, `--exprsn-radius-md`, `--exprsn-radius-lg`, `--exprsn-radius-xl`, `--exprsn-radius-2xl`, `--exprsn-radius-full`
- `--exprsn-spacing-xs` through `--exprsn-spacing-2xl`
- `--sidebar-width`, `--sidebar-collapsed-width`

#### Typography
- `--exprsn-font-family` - Main font (Inter)
- `--exprsn-font-family-mono` - Monospace font (JetBrains Mono/Fira Code)

#### Effects
- `--exprsn-shadow-sm`, `--exprsn-shadow-md`, `--exprsn-shadow-lg`, `--exprsn-shadow-xl`, `--exprsn-shadow-glow`
- `--exprsn-transition-fast`, `--exprsn-transition-base`, `--exprsn-transition-slow`

#### Gradients
- `--exprsn-gradient-primary`
- `--exprsn-gradient-warm`
- `--exprsn-gradient-cool`
- `--exprsn-gradient-success`

## Component Examples

### Button
```html
<button class="btn btn-primary">Primary Button</button>
<button class="btn btn-secondary">Secondary Button</button>
<button class="btn btn-outline-primary">Outline Button</button>
<button class="btn btn-success btn-sm">Small Success</button>
```

### Card
```html
<div class="card">
    <div class="card-header">
        <h3 class="card-title">Card Title</h3>
    </div>
    <div class="card-body">
        Card content goes here
    </div>
</div>
```

### Stat Card
```html
<div class="stat-card">
    <div class="stat-icon primary">
        <i class="fas fa-users"></i>
    </div>
    <div class="stat-content">
        <div class="stat-value">1,234</div>
        <div class="stat-label">Total Users</div>
        <div class="stat-change positive">+12.5%</div>
    </div>
</div>
```

### Alert
```html
<div class="alert alert-success">
    <i class="alert-icon fas fa-check-circle"></i>
    <div class="alert-content">
        <div class="alert-title">Success!</div>
        <div class="alert-message">Your changes have been saved.</div>
    </div>
</div>
```

### Form
```html
<div class="form-group">
    <label class="form-label required">Email Address</label>
    <input type="email" class="form-control" required>
    <div class="invalid-feedback">Please provide a valid email.</div>
</div>

<div class="form-check">
    <input type="checkbox" class="form-check-input" id="agree">
    <label class="form-check-label" for="agree">I agree to the terms</label>
</div>
```

### Table
```html
<div class="table-container">
    <table class="table">
        <thead>
            <tr>
                <th class="sortable">Name</th>
                <th class="sortable">Email</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>John Doe</td>
                <td>john@example.com</td>
                <td class="table-actions">
                    <button class="table-action-btn" title="Edit"><i class="fas fa-edit"></i></button>
                    <button class="table-action-btn danger" title="Delete"><i class="fas fa-trash"></i></button>
                </td>
            </tr>
        </tbody>
    </table>
</div>
```

## Customization

### Changing Colors

Override CSS variables in your own stylesheet:

```css
:root {
    --exprsn-primary: #your-color-here;
    --exprsn-primary-hover: #darker-shade;
}
```

### Creating Custom Themes

```css
[data-theme="custom"] {
    --exprsn-primary: #custom-color;
    --exprsn-bg-primary: #custom-background;
    /* ... override other variables */
}
```

### Adding Custom Components

```css
.custom-component {
    background: var(--exprsn-bg-primary);
    border: 1px solid var(--exprsn-border-color);
    padding: var(--exprsn-spacing-md);
    border-radius: var(--exprsn-radius-lg);
    transition: var(--exprsn-transition-base);
}
```

## Responsive Breakpoints

- **768px and below**: Mobile layout
  - Sidebar collapses to icon-only view
  - Grid layouts stack to single column
  - Page headers stack vertically

- **1200px and below**: Tablet layout
  - 4-column grids reduce to 2-column

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Performance Notes

- Pure CSS, no JavaScript required
- CSS variables for efficient theme switching
- Optimized selectors for fast rendering
- Minimal specificity to avoid conflicts
- No heavy animations or transitions
- ~43KB minified (optimal for production)

## Future Enhancements

- Add CSS Grid examples and utilities
- Expand animation library
- Add more component variants
- Create theme builder tool
- Add accessibility testing results

## Support

For issues or feature requests related to this stylesheet, please refer to the main project documentation.
