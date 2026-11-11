/**
 * Testes da base de conhecimento — sintomas + buscas diretas de unidade.
 */

import { HEALTH_KNOWLEDGE_BASE, matchKnowledgeBase } from "@/domain/health-kb";

describe("Base de conhecimento — estrutura", () => {
  it("tem entradas suficientes", () => {
    expect(HEALTH_KNOWLEDGE_BASE.length).toBeGreaterThanOrEqual(40);
  });

  it("todas as entradas têm keywords, level e facility_type válidos", () => {
    for (const entry of HEALTH_KNOWLEDGE_BASE) {
      expect(entry.keywords.length).toBeGreaterThan(0);
      expect(["leve", "moderado", "urgente"]).toContain(entry.level);
      expect(["ubs", "upa", "emergencia"]).toContain(entry.facility_type);
      expect(entry.guidance.length).toBeGreaterThan(20);
      expect(entry.source.length).toBeGreaterThan(5);
    }
  });
});

describe("Triagem por sintomas", () => {
  it("dor no peito → urgente / emergencia", () => {
    const r = matchKnowledgeBase("estou com dor no peito");
    expect(r?.level).toBe("urgente");
    expect(r?.facility_type).toBe("emergencia");
  });

  it("tosse e coriza → leve / ubs", () => {
    const r = matchKnowledgeBase("estou com tosse e coriza");
    expect(r?.level).toBe("leve");
    expect(r?.facility_type).toBe("ubs");
  });

  it("febre e dor no corpo → moderado / upa", () => {
    const r = matchKnowledgeBase("febre e dor no corpo");
    expect(r?.facility_type).toBe("upa");
  });

  it("tontura → moderado / upa", () => {
    const r = matchKnowledgeBase("estou com tontura");
    expect(r?.facility_type).toBe("upa");
  });

  it("picada de cobra → urgente / emergencia", () => {
    const r = matchKnowledgeBase("fui picado por cobra");
    expect(r?.level).toBe("urgente");
    expect(r?.facility_type).toBe("emergencia");
  });
});

describe("Triagem — buscas diretas de unidade (exemplos clicáveis)", () => {
  it("'qual hospital mais proximo?' → emergencia", () => {
    expect(matchKnowledgeBase("qual hospital mais proximo?")?.facility_type).toBe("emergencia");
  });

  it("'qual UBS mais proxima?' → ubs", () => {
    expect(matchKnowledgeBase("qual UBS mais proxima?")?.facility_type).toBe("ubs");
  });

  it("'qual UPA mais proxima?' → upa", () => {
    expect(matchKnowledgeBase("qual UPA mais proxima?")?.facility_type).toBe("upa");
  });

  it("'qual SPA mais proxima?' → upa", () => {
    expect(matchKnowledgeBase("qual SPA mais proxima?")?.facility_type).toBe("upa");
  });

  it("'qual policlinica mais proxima?' → ubs", () => {
    expect(matchKnowledgeBase("qual policlinica mais proxima?")?.facility_type).toBe("ubs");
  });

  it("'qual SPA/policlinica mais proxima?' → upa (entrada combinada)", () => {
    expect(matchKnowledgeBase("qual SPA/policlinica mais proxima?")?.facility_type).toBe("upa");
  });

  it("'pronto socorro mais proximo?' → emergencia", () => {
    expect(matchKnowledgeBase("pronto socorro mais proximo?")?.facility_type).toBe("emergencia");
  });

  it("'onde tem ubs perto de mim' → ubs", () => {
    expect(matchKnowledgeBase("onde tem ubs perto de mim")?.facility_type).toBe("ubs");
  });

  it("reconhece sem acento e em maiúsculas", () => {
    expect(matchKnowledgeBase("QUAL HOSPITAL MAIS PROXIMO")?.facility_type).toBe("emergencia");
    expect(matchKnowledgeBase("ubs mais proximo")?.facility_type).toBe("ubs");
  });
});

describe("Triagem — adversários", () => {
  it("mensagem aleatória sem sintoma → null (vira fallback conservador)", () => {
    expect(matchKnowledgeBase("ontem fui ao shopping e comprei sapatos")).toBeNull();
  });

  it("string vazia → null", () => {
    expect(matchKnowledgeBase("")).toBeNull();
  });

  it("só símbolos → null", () => {
    expect(matchKnowledgeBase("!@#$%¨&*()_+")).toBeNull();
  });

  it("sintoma urgente vence buscas diretas quando ambas batem", () => {
    // "dor no peito" (emer-01) e "qual hospital" (dir-02) têm 1 match cada;
    // a entrada de emergência vem antes na base → prioridade correta.
    const r = matchKnowledgeBase("dor no peito, qual hospital mais proximo?");
    expect(r?.facility_type).toBe("emergencia");
  });

  it("não confunde palavra parcial com keyword de 3+ letras ('dorgas' ≠ 'dor de garganta')", () => {
    expect(matchKnowledgeBase("dorgas e mais dorgas")).toBeNull();
  });
});
