import { ArrowRight, Bot, Loader2, Send, User as UserIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { aiErrorMessage } from '@/lib/ai';
import { readAuth, WORKSPACE_STORAGE_KEY } from '@/lib/api';
import {
  OBJECTIVE_LABEL,
  researchMission,
  type ClarifyQuestion,
  type ClarifyResponse,
  type ResearchObjective,
} from '@/lib/research';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Turn = { role: 'agent' | 'user'; content: string; questions?: ClarifyQuestion[] };

/**
 * Conversational mission intake. The employee types a free-text goal ("Finde
 * 1000 Key Accounts als Partner"); the agent asks clarifying questions with
 * quick-answer options until the brief is specific enough (status → ready).
 * Each create/answer is a synchronous LLM round-trip, so the buttons show a
 * spinner and surface a 409 (LLM/egress not configured) as a toast.
 */
export function ResearchMissionCreatePage() {
  const navigate = useNavigate();

  const [prompt, setPrompt] = useState('');
  const [objective, setObjective] = useState<ResearchObjective | 'auto'>('auto');
  const [targetCount, setTargetCount] = useState('');

  const [missionId, setMissionId] = useState<string | null>(null);
  const [thread, setThread] = useState<Turn[]>([]);
  const [answer, setAnswer] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const applyResponse = (res: ClarifyResponse) => {
    setMissionId(res.id);
    setReady(res.ready);
    setThread((t) => [
      ...t,
      { role: 'agent', content: res.message ?? '', questions: res.ready ? undefined : res.questions },
    ]);
  };

  const onCreate = async () => {
    const workspace = readAuth(WORKSPACE_STORAGE_KEY);
    if (!workspace) {
      toast.error('Kein aktiver Workspace gewählt.');
      return;
    }
    if (prompt.trim() === '') return;
    setBusy(true);
    try {
      const res = await researchMission.create({
        prompt: prompt.trim(),
        workspace,
        objective: objective === 'auto' ? undefined : objective,
        targetCount: targetCount ? Number(targetCount) : undefined,
      });
      applyResponse(res);
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Anfrage fehlgeschlagen (LLM/Egress prüfen).'));
    } finally {
      setBusy(false);
    }
  };

  const onAnswer = async () => {
    if (!missionId || answer.trim() === '') return;
    const mine = answer.trim();
    setThread((t) => [...t, { role: 'user', content: mine }]);
    setAnswer('');
    setBusy(true);
    try {
      const res = await researchMission.answer(missionId, mine);
      applyResponse(res);
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Antwort fehlgeschlagen.'));
    } finally {
      setBusy(false);
    }
  };

  const onRun = async () => {
    if (!missionId) return;
    setBusy(true);
    try {
      await researchMission.run(missionId);
      toast.success('Suche gestartet – Leads erscheinen gleich in der Mission.');
      navigate(`/research/missions/${missionId}`);
    } catch (err) {
      toast.error(aiErrorMessage(err, 'Start nicht möglich (externe Suche/Egress prüfen).'));
    } finally {
      setBusy(false);
    }
  };

  const appendOption = (opt: string) => {
    setAnswer((a) => (a.trim() === '' ? opt : `${a}\n${opt}`));
  };

  // -- initial prompt form --------------------------------------------------
  if (missionId === null) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl">Neue Recherche-Mission</h2>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="size-4" /> Auftrag beschreiben
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="prompt">Was soll der Agent finden?</Label>
              <Textarea
                id="prompt"
                rows={4}
                placeholder="z. B. Finde 1000 Key Accounts im DACH-Raum, die als Partner geeignet wären."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <div className="space-y-2">
                <Label>Ziel (optional)</Label>
                <Select value={objective} onValueChange={(v) => setObjective(v as ResearchObjective | 'auto')}>
                  <SelectTrigger className="w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatisch erkennen</SelectItem>
                    {Object.entries(OBJECTIVE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="target">Zielanzahl (optional)</Label>
                <Input
                  id="target"
                  type="number"
                  min={0}
                  className="w-40"
                  placeholder="z. B. 1000"
                  value={targetCount}
                  onChange={(e) => setTargetCount(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={() => void onCreate()} disabled={busy || prompt.trim() === ''}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              Recherche starten
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // -- clarification dialog --------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl">Recherche-Mission</h2>
        <Button variant="ghost" onClick={() => navigate(`/research/missions/${missionId}`)}>
          Zur Mission <ArrowRight className="size-4" />
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          {thread.map((turn, i) => (
            <div key={i} className={`flex gap-3 ${turn.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className="mt-1 shrink-0 rounded-full bg-muted p-1.5">
                {turn.role === 'agent' ? <Bot className="size-4" /> : <UserIcon className="size-4" />}
              </div>
              <div
                className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                  turn.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'
                }`}
              >
                <p className="whitespace-pre-wrap">{turn.content}</p>
                {turn.questions?.length ? (
                  <div className="mt-3 space-y-3">
                    {turn.questions.map((q) => (
                      <div key={q.key} className="space-y-1.5">
                        <p className="font-medium">{q.question}</p>
                        {q.options.length ? (
                          <div className="flex flex-wrap gap-1.5">
                            {q.options.map((opt) => (
                              <Badge
                                key={opt}
                                variant="outline"
                                className="cursor-pointer hover:bg-accent"
                                onClick={() => appendOption(opt)}
                              >
                                {opt}
                              </Badge>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {busy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Agent denkt nach…
            </div>
          ) : null}

          {ready ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
              <Badge variant="secondary">Bereit</Badge>
              <span className="text-sm">Der Auftrag ist klar. Jetzt die Suche starten?</span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" onClick={() => navigate(`/research/missions/${missionId}`)}>
                  Nur speichern
                </Button>
                <Button onClick={() => void onRun()} disabled={busy}>
                  Suche starten
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-end gap-2">
              <Textarea
                rows={2}
                placeholder="Antwort eingeben (oder Optionen oben antippen)…"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void onAnswer();
                  }
                }}
              />
              <Button onClick={() => void onAnswer()} disabled={busy || answer.trim() === ''}>
                <Send className="size-4" /> Senden
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
