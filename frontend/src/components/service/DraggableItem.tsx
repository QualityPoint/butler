import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PackageItem } from "@/data/packages";
import { cn } from "@/lib/utils";

interface DraggableItemProps {
  item: PackageItem;
  isDragging?: boolean;
  onRemove?: () => void;
}

export function DraggableItem({
  item,
  isDragging,
  onRemove,
}: DraggableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group relative bg-card border-3 border-border p-4 cursor-grab active:cursor-grabbing",
        "shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5",
        "font-sans text-base",
        isDragging || isSortableDragging ? "opacity-50" : "opacity-100",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium">{item.name}</span>
        <span className="text-xs bg-primary px-2 py-1 border-2 border-border font-head">
          {item.category}
        </span>
      </div>

      {onRemove && (
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
