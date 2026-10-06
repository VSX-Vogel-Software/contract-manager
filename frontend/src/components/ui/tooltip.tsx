import * as React from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import { useIsTouch } from "@/lib/useMediaQuery"

const TooltipProvider = TooltipPrimitive.Provider

/*
 * Radix-Tooltips oeffnen nur bei Mausberuehrung oder Fokus. Auf Touch-Geraeten
 * waeren Erklaerungen, die nur im Tooltip stehen, damit unerreichbar. Dort
 * wird derselbe Inhalt deshalb als Popover gerendert, der sich per Antippen
 * oeffnet und per Antippen daneben schliesst. Die API bleibt die von Radix.
 */
const TouchModeContext = React.createContext(false)

function Tooltip({
  delayDuration,
  disableHoverableContent,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const isTouch = useIsTouch()
  if (isTouch) {
    return (
      <TouchModeContext.Provider value={true}>
        <PopoverPrimitive.Root {...props} />
      </TouchModeContext.Provider>
    )
  }
  return (
    <TooltipPrimitive.Root
      delayDuration={delayDuration}
      disableHoverableContent={disableHoverableContent}
      {...props}
    />
  )
}

const TooltipTrigger = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Trigger>
>((props, ref) => {
  const touch = React.useContext(TouchModeContext)
  if (touch) return <PopoverPrimitive.Trigger ref={ref} {...props} />
  return <TooltipPrimitive.Trigger ref={ref} {...props} />
})
TooltipTrigger.displayName = TooltipPrimitive.Trigger.displayName

const contentClass =
  "z-50 max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-sm text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2"

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => {
  const touch = React.useContext(TouchModeContext)
  if (touch) {
    return (
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          ref={ref}
          sideOffset={sideOffset}
          collisionPadding={8}
          className={cn(contentClass, className)}
          {...(props as React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>)}
        />
      </PopoverPrimitive.Portal>
    )
  }
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        collisionPadding={8}
        className={cn(contentClass, className)}
        {...props}
      />
    </TooltipPrimitive.Portal>
  )
})
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
