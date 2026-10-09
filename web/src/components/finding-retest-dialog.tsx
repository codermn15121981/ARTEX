"use client";

import * as React from "react";

import { RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { FindingRetest } from "@/lib/types";

interface FindingRetestDialogProps {
  findingId: string;
  findingName?: string;
  onClose: () => void;
  onStarted?: (retest: FindingRetest) => void;
}

// Монтируется только при открытии, после закрытия заметка очищается; список и детали
// используют общий замок отправки и обработку ошибок, после запуска остаётся на текущей странице.
export function FindingRetestDialog({ findingId, findingName, onClose, onStarted }: FindingRetestDialogProps) {
  const notesId = React.useId();
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const submitLock = React.useRef(false);

  async function start() {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    try {
      const result = await api.startFindingRetest(findingId, notes.trim());
      onStarted?.(result.retest);
      onClose();
      toast.success(
        result.created
          ? "Повторный тест запущен, нажмите «Повторный тест», чтобы открыть сессию"
          : "Эта находка уже проходит повторный тест, можно открыть существующую сессию",
      );
    } catch (e) {
      toast.error(`Не удалось запустить повторный тест: ${(e as Error).message}`);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitLock.current && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Повторный тест находки #{findingId}</DialogTitle>
          <DialogDescription className="break-words">
            {findingName ? <span className="mb-2 block">{findingName}</span> : null}
            Агент повторного теста прочитает исходные доказательства и ограничения теста и выполнит целевую проверку
            в отдельной сессии. После успешного завершения повторного теста с подтверждённым исправлением статус
            находки автоматически меняется на «Исправлено», другие выводы сохраняют текущий статус.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field data-disabled={submitting}>
            <FieldLabel htmlFor={notesId}>Дополнительные заметки (опционально)</FieldLabel>
            <Textarea
              id={notesId}
              value={notes}
              maxLength={4000}
              rows={4}
              disabled={submitting}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Например: проверить тот же эндпоинт тем же тестовым аккаунтом; версия с исправлением — v2."
            />
            <FieldDescription>Можно указать версию с исправлением, условия теста или ограничения этого запуска.</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={submitting} onClick={() => void start()}>
            {submitting ? <Spinner data-icon="inline-start" /> : <RotateCcwIcon data-icon="inline-start" />}
            {submitting ? "Создание…" : "Начать повторный тест"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
