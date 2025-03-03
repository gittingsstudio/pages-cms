"use client";

import { forwardRef, useCallback, useMemo, useRef, useState } from "react";
import { getParentPath } from "@/lib/utils/file";
import { MediaDialog } from "@/components/media/media-dialog";
import { File } from "@/components/file";
import { Button } from "@/components/ui/button";
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Pencil, Trash2, ImagePlus, FileUpIcon } from "lucide-react";

// TODO: disable sortable for single file
// TODO: make component resilient to illegal parentPath

const SortableItem = ({
  id,
  path,
  children
}: {
  id: string,
  path: string,
  children: React.ReactNode
}) => {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 1000 : "auto"
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="relative w-28">
        <div {...attributes} {...listeners}>
          <File path={path} className="aspect-square rounded-md outline-none"/>
        </div>
        {children}
      </div>
    </div>
  );
};

const EditComponent = forwardRef((props: any, ref: React.Ref<HTMLInputElement>) => {
  const { value, field, onChange } = props;
  const [files, setImages] = useState<{ id: string, path: string }[]>(() => 
    value
      ? Array.isArray(value)
        ? value.map((path, index) => ({ id: `file-${index}`, path }))
        : [{ id: "file-0", path: value }]
      : []
  );
  
  const maxFiles = useMemo(() => {
    if (field.list && typeof field.list.max === 'number') {
      return field.list.max;
    }
    return field.list ? undefined : 1;
  }, [field]);

  const handleRemove = useCallback((index: number) => {
    let newImages = [...files];
    newImages.splice(index, 1);
    
    if (newImages.length === 0) {
      setImages([]);
      onChange(field.list ? [] : "");
    } else { 
      setImages(newImages);
      field.list
        ? onChange(newImages.map((item: any) => item.path))
        : onChange(newImages[0].path);
    }
  }, [field, files, onChange]);

  const handleSubmit = useCallback((newImages: string[]) => {
    if (newImages.length === 0) {
      setImages([]);
      onChange(field.list ? [] : "");
    } else {    
      const newImagesObjects = newImages.map((path: string, index: number) => ({ id: `file-${index}`, path }));
      setImages(newImagesObjects);
      field.list
        ? onChange(newImagesObjects.map((item: any) => item.path))
        : onChange(newImagesObjects[0].path);
    }
  }, [field, onChange]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      let newImages = files;
      const oldIndex = newImages.findIndex(item => item.id === active.id);
      const newIndex = newImages.findIndex(item => item.id === over.id);
      newImages = arrayMove(newImages, oldIndex, newIndex);
      setImages(newImages);
      onChange(newImages.map((item: any) => item.path));
    }
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={files} strategy={rectSortingStrategy}>
        {/* <div className="grid grid-flow-col auto-cols-max gap-4"> */}
        <div className="flex flex-wrap gap-4 items-start">

          {files.map((item, index) => 
            <SortableItem key={item.id} id={item.id} path={item.path}>
              <footer className="absolute bottom-2 right-2">
                <Button type="button" size="icon-xs" variant="outline" className="rounded-r-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-muted" onClick={() => handleRemove(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                <MediaDialog
                  selected={files.map((file: any) => file.path)}
                  onSubmit={handleSubmit}
                  maxSelected={maxFiles}
                  initialPath={getParentPath(item.path)}
                >
                  <Button type="button" size="icon-xs" variant="outline" className="rounded-l-none border-l-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:bg-muted">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </MediaDialog>
              </footer>
            </SortableItem>
          )}
          {(!maxFiles || files.length < maxFiles) && 
            <MediaDialog
              selected={files.map((file: any) => file.path)}
              onSubmit={handleSubmit}
              maxSelected={maxFiles}
            >
              <Button type="button" variant="outline" className="h-28 w-28">
                <div className="flex flex-col items-center gap-y-1 text-sm">
                  <FileUpIcon className="h-5 w-5 stroke-[1.5] text-foreground" />
                  <div>Add file</div>
                </div>
              </Button>
            </MediaDialog>
          }
        </div>
      </SortableContext>
    </DndContext>
  );
});

export { EditComponent };