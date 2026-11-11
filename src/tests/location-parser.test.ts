/**
 * Testes do parser de localização (RF-002b) — CEP, endereço composto,
 * cidade e coordenadas, com proteção contra relatos clínicos.
 */

import {
  extractCep,
  isPureCep,
  looksLikeLocationOnly,
} from "@/domain/location-parser";

describe("isPureCep", () => {
  it("CEP com hífen → true", () => {
    expect(isPureCep("69042-110")).toBe(true);
  });

  it("CEP sem hífen → true", () => {
    expect(isPureCep("69042110")).toBe(true);
  });

  it("CEP com espaços em volta → true", () => {
    expect(isPureCep("  69042-110  ")).toBe(true);
  });

  it("CEP incompleto (7 dígitos) → false", () => {
    expect(isPureCep("69042-11")).toBe(false);
  });

  it("CEP dentro de frase → false (não é puro)", () => {
    expect(isPureCep("rua juliaca, 10, cidade nova, 69094-060")).toBe(false);
  });

  it("número de 9 dígitos com máscara parecida → false", () => {
    // "92000-0001" tem 9 dígitos: o \b final falha (dígito segue dígito)
    expect(isPureCep("92000-0001")).toBe(false);
  });
});

describe("extractCep", () => {
  it("extrai CEP de endereço composto (requisito do usuário)", () => {
    expect(extractCep("rua juliaca,10, cidade nova, 69094-060")).toBe("69094060");
  });

  it("extrai CEP com hífen no meio de texto", () => {
    expect(extractCep("perto do 69042-077")).toBe("69042077");
  });

  it("texto sem CEP → null", () => {
    expect(extractCep("Alvorada, Manaus")).toBeNull();
  });

  it("8 dígitos corridos casam como CEP (limitação documentada)", () => {
    // \d{5}-?\d{3} com word boundaries aceita 8 dígitos seguidos —
    // é um CEP válido por formato; refinar exigiria base dos Correios.
    expect(extractCep("telefone 32321234")).toBe("32321234");
  });
});

describe("looksLikeLocationOnly — casos do usuário (RF-002b)", () => {
  it("CEP puro → true", () => {
    expect(looksLikeLocationOnly("69042-110")).toBe(true);
  });

  it("endereço composto com CEP → true", () => {
    expect(looksLikeLocationOnly("rua juliaca, 10, cidade nova, 69094-060")).toBe(true);
  });

  it("rua + número sem CEP → true", () => {
    expect(looksLikeLocationOnly("rua juliaca, 10")).toBe(true);
  });

  it("cidade → true", () => {
    expect(looksLikeLocationOnly("Manaus")).toBe(true);
  });

  it("bairro → true", () => {
    expect(looksLikeLocationOnly("Alvorada, Manaus")).toBe(true);
  });

  it("coordenadas → true", () => {
    expect(looksLikeLocationOnly("-3.10, -60.02")).toBe(true);
  });

  // PROTEÇÃO: sintomas NUNCA viram localização
  it("relato clínico com vírgula → false (vence SYMPTOM_HINT)", () => {
    expect(looksLikeLocationOnly("estou com dor forte, o que fazer?")).toBe(false);
  });

  it("tontura → false", () => {
    expect(looksLikeLocationOnly("estou com tontura e náusea")).toBe(false);
  });

  it("pergunta clínica com palavra 'centro' → false", () => {
    // 'centro' é hint de localização, mas 'dor' vence
    expect(looksLikeLocationOnly("dor forte no centro do peito")).toBe(false);
  });

  it("pergunta de KB ('qual UBS mais proxima?') → false", () => {
    // sem hint de endereço: sem rua/CEP/vírgula → deixa a KB responder
    expect(looksLikeLocationOnly("qual UBS mais proxima?")).toBe(false);
  });

  it("mensagem gigante → false (não é localização)", () => {
    expect(looksLikeLocationOnly("a ".repeat(200))).toBe(false);
  });

  it("mensagem vazia → false", () => {
    expect(looksLikeLocationOnly("")).toBe(false);
    expect(looksLikeLocationOnly("   ")).toBe(false);
  });
});
