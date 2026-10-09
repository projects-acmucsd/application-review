import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronDownIcon, Cross2Icon, PlusIcon } from '@radix-ui/react-icons';
import type { ApplicationFilters, BinaryAnswer, BinaryQuestion, DecisionStatus } from '../lib/applicationFilters';
import type { TrackKey } from '../lib/googleSheetData';

interface Props {
  applied: ApplicationFilters;
  questions: BinaryQuestion[];
  tracks: { key: TrackKey; label: string }[];
  onApply: (filters: ApplicationFilters) => void;
}
interface DraftQuestion { question: string; answer: BinaryAnswer | 'any' }
const control = 'portal-square-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2';

export function ApplicationFiltersPopover({ applied, questions, tracks, onApply }: Props) {
  const [open, setOpen] = useState(false);
  const [firstChoice, setFirstChoice] = useState<TrackKey | null>(null);
  const [decisionStatus, setDecisionStatus] = useState<DecisionStatus | null>(null);
  const [draftQuestions, setDraftQuestions] = useState<DraftQuestion[]>([]);
  const [panelHeight, setPanelHeight] = useState<number>();
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const filterCount = (applied.decisionStatus ? 1 : 0) + (applied.firstChoice ? 1 : 0) + applied.questions.length;

  const close = (restoreFocus = true) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  };

  useLayoutEffect(() => {
    if (!open) return;
    heading.current?.focus();
    // The header and toolbar wrap on phones; keep the actions within the viewport.
    const fitPanel = () => {
      const top = panel.current?.getBoundingClientRect().top;
      if (top !== undefined) setPanelHeight(Math.min(704, Math.max(160, window.innerHeight - top - 16)));
    };
    fitPanel();
    window.addEventListener('resize', fitPanel);
    window.addEventListener('scroll', fitPanel, true);
    const dismissOutside = (event: Event) => {
      // Add/remove can unmount the clicked button before this event reaches document.
      // The dispatch path still records that the click started inside the panel.
      if (root.current && !event.composedPath().includes(root.current)) setOpen(false);
    };
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', dismissOutside);
    document.addEventListener('click', dismissOutside);
    document.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('resize', fitPanel);
      window.removeEventListener('scroll', fitPanel, true);
      document.removeEventListener('pointerdown', dismissOutside);
      document.removeEventListener('click', dismissOutside);
      document.removeEventListener('keydown', keyboard);
    };
  }, [open]);

  const toggle = () => {
    if (open) { close(); return; }
    setFirstChoice(applied.firstChoice);
    setDecisionStatus(applied.decisionStatus);
    setDraftQuestions(applied.questions.length ? applied.questions.map((item) => ({ ...item })) :
      questions.length ? [{ question: questions[0].header, answer: 'any' }] : []);
    setOpen(true);
  };

  const updateQuestion = (index: number, change: Partial<DraftQuestion>) => {
    setDraftQuestions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...change } : item));
  };
  const availableQuestion = questions.find(({ header }) => !draftQuestions.some((item) => item.question === header));

  return (
    <div ref={root} className="relative ml-auto shrink-0">
      <button ref={trigger} type="button" aria-expanded={open} aria-controls="application-filters" aria-haspopup="dialog"
        onClick={toggle} className={`${control} inline-flex h-10 items-center gap-2 border border-blue-300 bg-blue-50 px-4 text-sm font-bold text-blue-600 hover:bg-blue-100`}>
        Filters{filterCount > 0 ? <span aria-label={`${filterCount} active filters`} className="text-xs">{filterCount}</span> : null}
        <ChevronDownIcon aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <section ref={panel} id="application-filters" role="dialog" aria-labelledby="application-filters-heading"
          style={{ maxHeight: panelHeight }}
          className="absolute right-0 top-full z-30 mt-2 flex max-h-[min(44rem,calc(100dvh-10rem))] w-[min(27rem,calc(100vw-5.5rem))] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white p-5 shadow-lg shadow-neutral-900/10 sm:p-6">
          <div className="mb-6 flex shrink-0 items-center justify-between">
            <h2 ref={heading} tabIndex={-1} id="application-filters-heading" className="text-xl font-bold text-[#333] outline-none">Filters</h2>
            <button type="button" aria-label="Close filters" onClick={() => close()} className={`${control} flex h-8 w-8 items-center justify-center text-neutral-500 hover:bg-neutral-50`}>
              <Cross2Icon aria-hidden="true" className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto">
            <fieldset className="min-w-0">
              <legend className="mb-3 text-sm font-bold text-[#333]">Decision status</legend>
              <div className="grid grid-cols-2 gap-2">
                {([
                  ['accept', 'Accepted'],
                  ['waitlist', 'Waitlist'],
                  ['reject', 'Rejected'],
                  ['none', 'None'],
                ] as const).map(([status, label]) => (
                  <button key={status} type="button" aria-pressed={decisionStatus === status}
                    onClick={() => setDecisionStatus(decisionStatus === status ? null : status)}
                    className={`${control} min-h-11 border px-3 py-2 text-sm font-semibold ${decisionStatus === status ? 'border-blue-500 bg-blue-500 text-white' : 'border-neutral-200 bg-white text-[#333] hover:bg-blue-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="my-5 border-t border-neutral-200" />
            <fieldset className="min-w-0">
              <legend className="mb-3 text-sm font-bold text-[#333]">First choice</legend>
              <div className="grid grid-cols-2 gap-2">
                {tracks.map(({ key, label }) => (
                  <button key={key} type="button" aria-pressed={firstChoice === key}
                    onClick={() => setFirstChoice(firstChoice === key ? null : key)}
                    className={`${control} min-h-11 border px-3 py-2 text-sm font-semibold ${firstChoice === key ? 'border-blue-500 bg-blue-500 text-white' : 'border-neutral-200 bg-white text-[#333] hover:bg-blue-50'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="my-5 border-t border-neutral-200" />
            <div>
              <h3 className="mb-3 text-sm font-bold text-[#333]">Question answer</h3>
              {!questions.length && !draftQuestions.length ? <p className="text-sm leading-6 text-neutral-500">No yes/no questions found in these applications.</p> : null}
              <div className="space-y-4">
                {draftQuestions.map((item, index) => (
                  <fieldset key={index} className="min-w-0">
                    <legend className="sr-only">Question filter {index + 1}</legend>
                    <div className="flex items-center gap-2">
                      <select aria-label={`Question ${index + 1}`} value={item.question}
                        onChange={(event) => updateQuestion(index, { question: event.target.value })}
                        className="portal-square-control min-h-10 w-full min-w-0 border border-neutral-200 bg-white px-2 text-sm text-[#333] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
                        {!questions.some(({ header }) => header === item.question) ? <option value={item.question}>{item.question} (unavailable)</option> : null}
                        {questions.map(({ header, label }) => <option key={header} value={header}
                          disabled={draftQuestions.some((other, otherIndex) => otherIndex !== index && other.question === header)}>{label}</option>)}
                      </select>
                      {draftQuestions.length > 1 ? <button type="button" aria-label={`Remove question ${index + 1}`}
                        onClick={() => setDraftQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                        className={`${control} flex h-10 w-8 shrink-0 items-center justify-center text-neutral-500 hover:bg-neutral-50`}><Cross2Icon aria-hidden="true" /></button> : null}
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-1" role="group" aria-label={`Answer for question ${index + 1}`}>
                      {(['any', 'yes', 'no'] as const).map((answer) => <button key={answer} type="button" aria-pressed={item.answer === answer}
                        onClick={() => updateQuestion(index, { answer })}
                        className={`${control} min-h-10 border px-2 text-sm font-semibold ${item.answer === answer ? 'border-blue-500 bg-blue-500 text-white' : 'border-neutral-200 text-neutral-500 hover:bg-blue-50'}`}>
                        {answer === 'any' ? 'Any' : answer === 'yes' ? 'Yes' : 'No'}
                      </button>)}
                    </div>
                  </fieldset>
                ))}
              </div>
              {availableQuestion ? <button type="button" onClick={() => setDraftQuestions((current) => [...current, { question: availableQuestion.header, answer: 'any' }])}
                className={`${control} mt-3 inline-flex min-h-8 items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700`}>
                <PlusIcon aria-hidden="true" /> Add question
              </button> : null}
            </div>
          </div>
          <div className="mt-6 flex shrink-0 items-center justify-between">
            <button type="button" onClick={() => {
              setFirstChoice(null);
              setDecisionStatus(null);
              setDraftQuestions(questions.length ? [{ question: questions[0].header, answer: 'any' }] : []);
            }} className={`${control} min-h-10 px-1 text-sm font-semibold text-neutral-500 underline underline-offset-2`}>Reset</button>
            <button type="button" onClick={() => {
              onApply({ decisionStatus, firstChoice, questions: draftQuestions.flatMap(({ question, answer }) => answer === 'any' ? [] : [{ question, answer }]) });
              close();
            }} className={`${control} min-h-11 bg-blue-500 px-6 text-sm font-bold text-white hover:bg-blue-600`}>Apply</button>
          </div>
        </section>
      ) : null}
    </div>
  );
}
