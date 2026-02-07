import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PackageItem } from "@/data/packages";
import { cn } from "@/lib/utils";

interface DraggableItemProps {
  item: PackageItem;
  isDragging?: boolean;
  onRemove?: () => void;
  onIncrement?: () => void;
  onDecrement?: () => void;
  disabled?: boolean;
}

export function DraggableItem({
  item,
  isDragging,
  onRemove,
  onIncrement,
  onDecrement,
  disabled = false,
}: DraggableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ 
    id: item.id,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className={cn(
        "group relative bg-card border-3 border-border p-3 sm:p-4 min-h-16",
        "shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5",
        "font-sans text-sm sm:text-base",
        isDragging || isSortableDragging ? "opacity-50" : "opacity-100",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-4">
        <div 
          {...listeners}
          className="flex-1 min-w-0 cursor-grab active:cursor-grabbing order-1"
        >
          <span className="font-medium truncate block">{item.name}</span>
        </div>
        
        {/* Quantity controls */}
        {(onIncrement || onDecrement) && (
          <div className="flex items-center gap-1 order-3 sm:order-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDecrement?.();
              }}
              disabled={item.count <= 1 || disabled}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-lg sm:text-xl font-bold bg-gray-200 text-white hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              −
            </button>
            <span className="font-head text-sm sm:text-base min-w-8 sm:min-w-10 text-center px-1 sm:px-2">
              {item.count}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onIncrement?.();
              }}
              disabled={disabled}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-lg sm:text-xl font-bold bg-gray-800 text-white hover:bg-primary hover:text-primary-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              +
            </button>
          </div>
        )}
        
        <span className="text-xs bg-primary px-2 py-1 border-2 border-border font-head whitespace-nowrap order-2 sm:order-3">
          {item.category}
        </span>
      </div>

      {onRemove && !disabled && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full border-2 border-border opacity-0 group-hover:opacity-100 transition-opacity font-bold text-sm hover:bg-red-600 flex items-center justify-center"
        >
          ×
        </button>
      )}
    </div>
  );
}
