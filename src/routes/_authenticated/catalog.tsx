import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers3, Pencil, Plus, Search, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/catalog")({
  head: () => ({
    meta: [
      { title: "الفئات والعلامات التجارية — SmartPOS" },
      { name: "description", content: "إدارة فئات المنتجات وعلاماتها التجارية." },
      { property: "og:title", content: "الفئات والعلامات التجارية — SmartPOS" },
      { property: "og:description", content: "تنظيم كتالوج المنتجات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CatalogPage,
});

type CatalogKind = "categories" | "brands";
type CatalogRow = { id: string; name: string; description?: string | null };

function CatalogPage() {
  const { can, profile } = useAuth();
  const qc = useQueryClient();
  const editable = can("products.edit");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<{ kind: CatalogKind; row: CatalogRow | null } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brands")
        .select("id, name, description")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!editor || !profile?.org_id || !name.trim()) throw new Error("اسم السجل مطلوب");
      const result = editor.row
        ? editor.kind === "brands"
          ? await supabase
              .from("brands")
              .update({ name: name.trim(), description: description.trim() || null })
              .eq("id", editor.row.id)
          : await supabase.from("categories").update({ name: name.trim() }).eq("id", editor.row.id)
        : editor.kind === "brands"
          ? await supabase
              .from("brands")
              .insert({
                name: name.trim(),
                description: description.trim() || null,
                org_id: profile.org_id,
              })
          : await supabase.from("categories").insert({ name: name.trim(), org_id: profile.org_id });
      if (result.error) throw result.error;
    },
    onSuccess: () => {
      toast.success("تم حفظ التغييرات");
      void qc.invalidateQueries({ queryKey: [editor?.kind] });
      setEditor(null);
    },
    onError: (error: { code?: string; message?: string }) =>
      toast.error(error.code === "23505" ? "الاسم مستخدم بالفعل" : (error.message ?? "تعذر الحفظ")),
  });
  const remove = useMutation({
    mutationFn: async ({ kind, row }: { kind: CatalogKind; row: CatalogRow }) => {
      if (!window.confirm(`حذف ${row.name}؟ ستبقى المنتجات دون هذا الربط.`)) return false;
      const { error } = await supabase.from(kind).delete().eq("id", row.id);
      if (error) throw error;
      return true;
    },
    onSuccess: (done, variables) => {
      if (!done) return;
      toast.success("تم الحذف");
      void qc.invalidateQueries({ queryKey: [variables.kind] });
      void qc.invalidateQueries({ queryKey: ["products"] });
    },
    onError: () => toast.error("تعذر الحذف"),
  });
  const open = (kind: CatalogKind, row: CatalogRow | null = null) => {
    setEditor({ kind, row });
    setName(row?.name ?? "");
    setDescription(row?.description ?? "");
  };
  const filter = (rows: CatalogRow[]) => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) => !query || row.name.toLowerCase().includes(query));
  };

  if (!can("products.view"))
    return (
      <div className="p-10 text-center text-muted-foreground">لا تملك صلاحية عرض الكتالوج.</div>
    );
  return (
    <div className="pb-8">
      <PageHeader
        title="الفئات والعلامات التجارية"
        description="نظّم المنتجات لتسريع البحث والبيع"
      />
      <div className="space-y-4 px-4 sm:px-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pe-10"
            placeholder="ابحث بالاسم"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Tabs defaultValue="categories">
          <TabsList>
            <TabsTrigger value="categories">
              <Layers3 /> الفئات
            </TabsTrigger>
            <TabsTrigger value="brands">
              <Tags /> العلامات التجارية
            </TabsTrigger>
          </TabsList>
          <TabsContent value="categories">
            <CatalogList
              title="فئات المنتجات"
              icon={Layers3}
              rows={filter(categories.data ?? [])}
              editable={editable}
              onAdd={() => open("categories")}
              onEdit={(row) => open("categories", row)}
              onRemove={(row) => remove.mutate({ kind: "categories", row })}
            />
          </TabsContent>
          <TabsContent value="brands">
            <CatalogList
              title="العلامات التجارية"
              icon={Tags}
              rows={filter(brands.data ?? [])}
              editable={editable}
              onAdd={() => open("brands")}
              onEdit={(row) => open("brands", row)}
              onRemove={(row) => remove.mutate({ kind: "brands", row })}
            />
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={Boolean(editor)} onOpenChange={(value) => !value && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editor?.row ? "تعديل" : "إضافة"} {editor?.kind === "brands" ? "علامة تجارية" : "فئة"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="catalog-name">الاسم</Label>
              <Input
                id="catalog-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            {editor?.kind === "brands" ? (
              <div className="space-y-2">
                <Label htmlFor="catalog-description">الوصف</Label>
                <Input
                  id="catalog-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>
              إلغاء
            </Button>
            <Button disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogList({
  title,
  icon: Icon,
  rows,
  editable,
  onAdd,
  onEdit,
  onRemove,
}: {
  title: string;
  icon: typeof Tags;
  rows: CatalogRow[];
  editable: boolean;
  onAdd: () => void;
  onEdit: (row: CatalogRow) => void;
  onRemove: (row: CatalogRow) => void;
}) {
  return (
    <div className="workspace-card overflow-hidden">
      <div className="flex items-center justify-between border-b p-4">
        <div className="flex items-center gap-2 font-black">
          <Icon className="size-5 text-primary" /> {title}
        </div>
        {editable ? (
          <Button onClick={onAdd}>
            <Plus /> إضافة
          </Button>
        ) : null}
      </div>
      <div className="divide-y">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <div className="font-bold">{row.name}</div>
              {row.description ? (
                <div className="truncate text-xs text-muted-foreground">{row.description}</div>
              ) : null}
            </div>
            {editable ? (
              <>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`تعديل ${row.name}`}
                  onClick={() => onEdit(row)}
                >
                  <Pencil />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`حذف ${row.name}`}
                  onClick={() => onRemove(row)}
                >
                  <Trash2 className="text-destructive" />
                </Button>
              </>
            ) : null}
          </div>
        ))}
        {!rows.length ? (
          <div className="p-10 text-center text-sm text-muted-foreground">لا توجد نتائج.</div>
        ) : null}
      </div>
    </div>
  );
}
