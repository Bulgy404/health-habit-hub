# Render all diagrams to ./out — requires mermaid-cli (mmdc) and plantuml (or docker)
MMD_SRC   := $(wildcard architecture/*.mmd classes/*.mmd sequences/*.mmd)
PUML_SRC  := $(wildcard use-cases/*.puml)
OUT       := out

SVG := $(patsubst %.mmd,$(OUT)/%.svg,$(notdir $(MMD_SRC)))
PNG := $(patsubst %.mmd,$(OUT)/%.png,$(notdir $(MMD_SRC)))
PDF := $(patsubst %.mmd,$(OUT)/%.pdf,$(notdir $(MMD_SRC)))

VPATH := architecture:classes:sequences

.PHONY: all svg png pdf puml clean
all: svg puml
svg: $(SVG)
png: $(PNG)
pdf: $(PDF)

$(OUT)/%.svg: %.mmd | $(OUT)
	mmdc -i $< -o $@

$(OUT)/%.png: %.mmd | $(OUT)
	mmdc -i $< -o $@ -b transparent --scale 2

$(OUT)/%.pdf: %.mmd | $(OUT)
	mmdc -i $< -o $@

puml: | $(OUT)
	@command -v plantuml >/dev/null \
	  && plantuml -tsvg $(PUML_SRC) -o ../$(OUT) \
	  || docker run --rm -v "$$PWD":/work -w /work plantuml/plantuml -tsvg $(PUML_SRC) -o ../$(OUT)

$(OUT):
	mkdir -p $(OUT)

clean:
	rm -rf $(OUT)
