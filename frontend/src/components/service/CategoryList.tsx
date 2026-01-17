import { useDraggable } from "@dnd-kit/core";
import type { PackageCategory, PackageItem } from "@/data/packages";
import { cn } from "@/lib/utils";

interface CategoryListProps {
  category: PackageCategory;
  items: string[];
  selectedItems: PackageItem[];
}

function CategoryItemCard({
  itemName,
  category,
  isSelected,
}: {
  itemName: string;
  category: PackageCategory;
  isSelected: boolean;
}) {
  const itemId = `${category.toLowerCase()}-${itemName.toLowerCase().replace(/\s+/g, "-")}`;

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: itemId,
    disabled: isSelected,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "bg-background border-2 border-border p-3 cursor-grab active:cursor-grabbing",
        "shadow hover:shadow-md transition-all hover:-translate-y-0.5",
        "font-sans text-sm",
        isDragging && "opacity-50",
        isSelected && "opacity-40 cursor-not-allowed bg-muted",
      )}
    >
      <div className="flex items-center justify-between">
        <span>{itemName}</span>
        {isSelected && (
          <span className="text-xs bg-green-500 text-white px-2 py-0.5 border border-border">
            ✓
          </span>
        )}
      </div>
    </div>
  );
}

export function CategoryList({
  category,
  items,
  selectedItems,
}: CategoryListProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[500px] overflow-y-auto pr-2">
      {items.map((itemName) => {
        const itemId = `${category.toLowerCase()}-${itemName.toLowerCase().replace(/\s+/g, "-")}`;
        const isSelected = selectedItems.some((item) => item.id === itemId);

        return (
          <CategoryItemCard
            key={itemId}
            itemName={itemName}
            category={category}
            isSelected={isSelected}
          />
        );
      })}
    </div>
  );
}
