# `tailwind.config.ts` — JAS patch

Only two things need to change in the furniture app's `tailwind.config.ts`:

1. The `fontFamily` block now points at Heebo (sans) and Bowlby One SC (display /
   serif legacy alias) instead of Roboto + Crimson Pro.
2. The color extensions stay exactly as they are — they already read
   `hsl(var(--token))`, and our new `index.css.jas` sets those tokens to JAS values.
   **Do not touch the `colors` block.**

## Lovable prompt (paste verbatim)

> Update `tailwind.config.ts` with two changes:
>
> 1. Replace the entire `fontFamily` object inside `theme.extend` with:
>
> ```ts
> fontFamily: {
>   sans: ['Heebo', 'ui-sans-serif', 'system-ui', 'sans-serif'],
>   display: ['Bowlby One SC', 'Heebo', 'system-ui', 'sans-serif'],
>   serif: ['Bowlby One SC', 'Heebo', 'serif'],
>   mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
> },
> ```
>
> 2. Leave every other block (`container`, `colors`, `borderRadius`, `keyframes`,
>    `animation`, `plugins`) exactly as it is.
>
> Do not change any component that uses `font-sans`, `font-serif`, or
> `font-display` — they will continue to work and will now pick up Heebo and
> Bowlby One SC automatically.

## Why this is enough

The app's shadcn color system reads every color from CSS variables
(`hsl(var(--primary))`, etc.). Our new `index.css` sets those variables to JAS
values. So classes like `bg-primary`, `text-muted-foreground`, `border-border`
automatically become JAS-correct without touching the config.

The only token the config has to teach Tailwind about is the new `font-display`
utility class, which is used in a few hero lockups but is not mandatory for the
migration to work.
