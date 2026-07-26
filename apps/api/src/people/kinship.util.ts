type PersonNode = {
  id: string;
  fatherId: string | null;
  motherId: string | null;
  sex?: string | null;
};

export function computeKinship(
  targetId: string,
  centralId: string,
  allPeople: PersonNode[],
): string {
  if (targetId === centralId) return 'Você';

  const childrenOf = new Map<string, string[]>();
  const personMap = new Map<string, PersonNode>();

  for (const p of allPeople) {
    personMap.set(p.id, p);
    if (p.fatherId) {
      if (!childrenOf.has(p.fatherId)) childrenOf.set(p.fatherId, []);
      childrenOf.get(p.fatherId)!.push(p.id);
    }
    if (p.motherId) {
      if (!childrenOf.has(p.motherId)) childrenOf.set(p.motherId, []);
      childrenOf.get(p.motherId)!.push(p.id);
    }
  }

  const visited = new Set<string>();
  const queue: { id: string; ups: number; downs: number }[] = [
    { id: centralId, ups: 0, downs: 0 },
  ];

  while (queue.length > 0) {
    const { id, ups, downs } = queue.shift()!;
    const key = `${id}:${ups}:${downs}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (id === targetId) {
      const target = personMap.get(targetId);
      return kinshipLabel(ups, downs, target?.sex ?? null);
    }

    if (ups + downs >= 8) continue;

    const current = personMap.get(id);
    if (!current) continue;

    if (downs === 0) {
      if (current.fatherId)
        queue.push({ id: current.fatherId, ups: ups + 1, downs: 0 });
      if (current.motherId)
        queue.push({ id: current.motherId, ups: ups + 1, downs: 0 });
    }

    for (const childId of childrenOf.get(id) ?? []) {
      queue.push({ id: childId, ups, downs: downs + 1 });
    }
  }

  return 'Parente distante';
}

function g(
  sex: string | null,
  male: string,
  female: string,
  neutral: string,
): string {
  if (sex === 'MALE') return male;
  if (sex === 'FEMALE') return female;
  return neutral;
}

function kinshipLabel(ups: number, downs: number, sex: string | null): string {
  const key = `${ups}:${downs}`;
  const table: Record<string, [string, string, string]> = {
    '1:0': ['Pai', 'Mãe', 'Pai/Mãe'],
    '0:1': ['Filho', 'Filha', 'Filho(a)'],
    '2:0': ['Avô', 'Avó', 'Avô/Avó'],
    '0:2': ['Neto', 'Neta', 'Neto(a)'],
    '1:1': ['Irmão', 'Irmã', 'Irmão/Irmã'],
    '3:0': ['Bisavô', 'Bisavó', 'Bisavô/Bisavó'],
    '0:3': ['Bisneto', 'Bisneta', 'Bisneto(a)'],
    '2:1': ['Tio', 'Tia', 'Tio/Tia'],
    '1:2': ['Sobrinho', 'Sobrinha', 'Sobrinho(a)'],
    '2:2': ['Primo', 'Prima', 'Primo(a)'],
    '4:0': ['Trisavô', 'Trisavó', 'Trisavô/Trisavó'],
    '0:4': ['Trisneto', 'Trisneta', 'Trisneto(a)'],
    '3:1': ['Tio-avô', 'Tia-avó', 'Tio(a)-avô/avó'],
    '1:3': ['Sobrinho-neto', 'Sobrinha-neta', 'Sobrinho(a)-neto(a)'],
    '3:2': ['Primo em 2º grau', 'Prima em 2º grau', 'Primo(a) em 2º grau'],
    '2:3': ['Primo em 2º grau', 'Prima em 2º grau', 'Primo(a) em 2º grau'],
    '3:3': ['Primo em 3º grau', 'Prima em 3º grau', 'Primo(a) em 3º grau'],
  };

  const entry = table[key];
  if (entry) return g(sex, entry[0], entry[1], entry[2]);
  return `Parente de ${Math.max(ups, downs)}º grau`;
}
