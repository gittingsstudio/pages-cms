"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import {
  useForm,
  useFieldArray,
  useFormState,
  Control,
  useFormContext
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { editComponents, supportsList } from "@/fields/registry";
import {
  initializeState,
  getDefaultValue,
  generateZodSchema,
  sanitizeObject
} from "@/lib/schema";
import { Field } from "@/types/field";
import { EntryHistoryBlock, EntryHistoryDropdown } from "./entry-history";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  restrictToVerticalAxis,
  restrictToParentElement
} from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ChevronDown, ChevronLeft, ChevronsUpDown, ChevronUp, GripVertical, Loader, Plus, Trash2 } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

const SortableItem = ({
  id,
  type,
  children
}: {
  id: string,
  type: string,
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
    transition
  };

  return (
    <div ref={setNodeRef} className={cn("bg-background flex gap-x-1 rounded-lg border items-center", type === "object" ? "px-2 py-4" : "px-1 py-2", isDragging ? "z-50" : "z-10")} style={style}>
      <Button type="button" variant="ghost" size="icon-sm" className="h-8 cursor-move" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4" />
      </Button>
      {children}
    </div>
  );
};

const ListField = ({
  control,
  field,
  fieldName,
  renderFields,
}: {
  control: Control;
  field: Field;
  fieldName: string;
  renderFields: (fields: Field[], parentName?: string, parent?: Field) => React.ReactNode;
}) => {
  const { fields: arrayFields, append, remove, move } = useFieldArray({
    control,
    name: fieldName,
  });
  // TODO: why is this not used?
  const { errors } = useFormState({ control });

  const { setValue, watch } = useFormContext();
  const fieldValues = watch(fieldName);

  const hasAppended = useRef(false);

  useEffect(() => {
    const defaultEntry = getDefaultValue(field);

    if (typeof defaultEntry === "object" && Object.keys(defaultEntry).length === 0) {
      return;
    }

    if (arrayFields.length === 0 && !hasAppended.current && defaultEntry) {
      append(defaultEntry);
      hasAppended.current = true;
    }
  }, [arrayFields, append, field]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const modifiers = [restrictToVerticalAxis, restrictToParentElement]

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = arrayFields.findIndex((item) => item.id === active.id);
      const newIndex = arrayFields.findIndex((item) => item.id === over.id);
      move(oldIndex, newIndex);

      const updatedValues = arrayMove(fieldValues, oldIndex, newIndex);
      setValue(fieldName, updatedValues);
    }
  };

  return (
    <FormField
      name={fieldName}
      control={control}
      render={({ field: formField, fieldState: { error } }) => (
        <FormItem>
          {field.label !== false &&
            <FormLabel className="text-sm font-medium">
              {field.label || field.name}
            </FormLabel>
          }
          {field.required && (
            <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>
          )}
          <div className="space-y-2">
            <DndContext sensors={sensors} modifiers={modifiers} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={arrayFields.map(item => item.id)} strategy={verticalListSortingStrategy}>
                {arrayFields.map((arrayField, index) => (
                  <SortableItem key={arrayField.id} id={arrayField.id} type={field.type}>
                    <div className="grid gap-6 flex-1">
                      {field.type === "object" && field.fields
                        ? renderFields(field.fields, `${fieldName}.${index}`)
                        : field.types !== undefined ?
                          (() => {
                            const type = (arrayField as any).type;
                            const nestedConfig = field.types.find(t => t.name === type);

                            return renderFields([{
                              type: 'object',
                              name: '',
                              label: nestedConfig?.label || nestedConfig?.name,
                              fields: Object.keys(arrayField)
                                .map((key) => {
                                  const nestedField = nestedConfig?.fields.find(f => f.name === key);
                                  return nestedField || null;
                                })
                                .filter((field): field is Field => field !== null)
                                .sort((a, b) => {
                                  if (!a || !b) return 0;
                                  const aIndex = nestedConfig?.fields.findIndex(f => f.name === a.name);
                                  const bIndex = nestedConfig?.fields.findIndex(f => f.name === b.name);
                                  return (aIndex ?? 0) - (bIndex ?? 0);
                                })
                            }], `${fieldName}.${index}`, field)
                          })()
                          :
                          renderSingleField(field, `${fieldName}.${index}`, control, false)
                      }
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)}>
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Remove entry
                      </TooltipContent>
                    </Tooltip>
                  </SortableItem>
                ))}
              </SortableContext>
            </DndContext>
            {typeof field.list === "object" && field.list?.max && arrayFields.length >= field.list.max
              ? null
              : field.types !== undefined ?
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      Add an entry
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {field.types?.map(type => (
                      <DropdownMenuItem
                        key={type.name}
                        onClick={() => {
                          const selectedType = field.types?.find(t => t.name === type.name);
                          if (selectedType) {
                            append({
                              type: type.name,
                              ...initializeState(selectedType.fields, {}, true)
                            });
                          }
                        }}
                      >
                        {type.label || type.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                : <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    append(field.type === "object"
                      ? initializeState(field.fields, {}, true)
                      : getDefaultValue(field)
                    );
                  }}
                  className="gap-x-2"
                >
                  <Plus className="h-4 w-4" />
                  Add an entry
                </Button>
            }
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  );
};

const renderSingleField = (
  field: Field,
  fieldName: string,
  control: Control,
  showLabel = true
) => {
  const FieldComponent = editComponents?.[field.type] || editComponents["text"];

  return (
    <FormField
      name={fieldName}
      key={fieldName}
      control={control}
      render={({ field: fieldProps }) => {
        return (
          <FormItem>
            {showLabel && field.label !== false &&
              <FormLabel className="h-5">
                {field.label || field.name}
              </FormLabel>
            }
            {field.required && <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>}
            <FormControl>
              <FieldComponent {...fieldProps} field={field} />
            </FormControl>
            {field.description && <FormDescription>{field.description}</FormDescription>}
            <FormMessage />
          </FormItem>
        );
      }}
    />
  );
};

const CollapsibleField = ({
  label,
  required,
  defaultOpen,
  children
}: {
  label: string;
  required: boolean;
  defaultOpen: boolean;
  children: React.ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible key={label} open={open} onOpenChange={setOpen} defaultOpen={defaultOpen}>
      <div className="flex items-center gap-1 text-sm font-medium leading-none">
        {label}
        {required && <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs font-medium">Required</span>}

        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm">
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="mt-2 grid gap-6">
          {children}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const EntryForm = ({
  title,
  navigateBack,
  fields,
  contentObject,
  onSubmit = (values) => console.log(values),
  history,
  path,
  options,
  schema
}: {
  title: string;
  navigateBack?: string;
  fields: Field[];
  contentObject?: any;
  onSubmit: (values: any) => void;
  history?: Record<string, any>[];
  path?: string;
  options: React.ReactNode;
  schema: any;
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const zodSchema = useMemo(() => {
    return generateZodSchema(fields, true);
  }, [fields]);

  const defaultValues = useMemo(() => {
    return initializeState(fields, sanitizeObject(contentObject), true);
  }, [fields, contentObject]);

  const form = useForm({
    resolver: zodSchema && zodResolver(zodSchema),
    defaultValues,
  });

  const { isDirty } = useFormState({
    control: form.control
  });

  // TODO: investigate why this run on every input focus
  const renderFields = (fields: Field[], parentName?: string, parent?: Field) => {
    return fields.map((field) => {
      if (field.hidden) return null;

      const fieldName = parentName ? field.name ? `${parentName}.${field.name}` : parentName : field.name;
      const hasTypes = parent?.types?.length ?? 0 > 0;
      const defaultOpen = hasTypes ? false : field.collapsed ? !field.collapsed : true;

      if (field.types) {
        return <ListField key={fieldName} control={form.control} field={field} fieldName={fieldName} renderFields={renderFields} />;
      } else if (field.type === "object" && field.list && !supportsList[field.type]) {
        return <ListField key={fieldName} control={form.control} field={field} fieldName={fieldName} renderFields={renderFields} />;
      } else if (field.type === "object") {
        return (
          <div key={fieldName}>
            <CollapsibleField label={field.label || field.name} required={field.required ?? false} defaultOpen={defaultOpen}>
              <div className="grid gap-6 rounded-lg border p-4">
                {renderFields(field.fields || [], fieldName, field)}
              </div>
            </CollapsibleField>
          </div>
        )
      } else if (field.list && !supportsList[field.type]) {
        return <ListField key={fieldName} control={form.control} field={field} fieldName={fieldName} renderFields={renderFields} />;
      }

      return renderSingleField(field, fieldName, form.control);
    });
  };

  const handleSubmit = async (values: any) => {
    setIsSubmitting(true);

    try {
      await onSubmit(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  const groups = useMemo(() => {
    const schemaGroups: [{ name: string; label?: string }] = schema?.groups;

    if (!schemaGroups) {
      return [];
    }

    return (schemaGroups).map((group) => {
      return {
        name: group.name,
        label: group.label,
        fields: fields.filter(field => {
          // If field.group doesn't exist in schema groups, put it in first tab
          if (field.group && !schemaGroups.find(g => g.name === field.group) && group.name === schemaGroups[0].name) {
            return true;
          }

          // If field has a group and it matches current group, include it
          if (field.group && group.name) {
            return field.group === group.name;
          }

          // If field has no group, put it in first tab
          if (!field.group && group.name === schemaGroups[0].name) {
            return true;
          }

          return false;
        })
      };
    });
  }, [schema, fields]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)}>
        <div className="max-w-screen-xl mx-auto flex w-full gap-x-8">
          <div className="flex-1 w-0">
            <header className="flex items-center mb-6">
              {navigateBack &&
                <Link
                  className={cn(buttonVariants({ variant: "outline", size: "icon-xs" }), "mr-4 shrink-0")}
                  href={navigateBack}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Link>
              }

              <h1 className="font-semibold text-lg md:text-2xl truncate">{title}</h1>
            </header>
            <div onSubmit={form.handleSubmit(handleSubmit)} className="grid items-start gap-6">
              {
                groups.length > 0 ?
                  <Tabs defaultValue={groups[0].name}>
                    <TabsList>
                      {groups.map((group: any) => (
                        <TabsTrigger key={group.name} value={group.name}>
                          {group.label || group.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    {
                      groups.map((group: any) => (
                        <TabsContent key={group.name} value={group.name} className="grid gap-6">
                          {renderFields(group.fields)}
                        </TabsContent>
                      ))
                    }
                  </Tabs>
                  :
                  renderFields(fields)
              }
            </div>
          </div>

          <div className="hidden lg:block w-64">
            <div className="flex flex-col gap-y-4 sticky top-0">
              <div className="flex gap-x-2">
                <Button type="submit" className="w-full" disabled={isSubmitting || !isDirty}>
                  Save
                  {isSubmitting && (<Loader className="ml-2 h-4 w-4 animate-spin" />)}
                </Button>
                {options ? options : null}
              </div>
              {path && history && <EntryHistoryBlock history={history} path={path} />}
            </div>
          </div>
          <div className="lg:hidden fixed top-0 right-0 h-14 flex items-center gap-x-2 z-10 pr-4 md:pr-6">
            {path && history && <EntryHistoryDropdown history={history} path={path} />}
            <Button type="submit" disabled={isSubmitting}>
              Save
              {isSubmitting && (<Loader className="ml-2 h-4 w-4 animate-spin" />)}
            </Button>
            {options ? options : null}
          </div>
        </div>
      </form>
    </Form>
  );
};

export { EntryForm }