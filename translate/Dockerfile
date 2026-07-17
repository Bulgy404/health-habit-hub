# Custom LibreTranslate image with language models baked in at build time.
#
# The upstream libretranslate/libretranslate image ships NO models — it tries to
# download them on first boot, which requires outbound internet to the Argos
# model servers and a writable model store. On the locked-down production server
# that download fails, leaving zero languages loaded and crashing startup with
# `IndexError: list index out of range`.
#
# Baking the models here (during the image build, which does have internet) means
# the runtime container is fully self-contained: no model download, no writable
# volume, no permission tweaks. RUN executes as the image's default
# `libretranslate` user, whose home dir is writable.
FROM libretranslate/libretranslate:v1.9.5

RUN ./venv/bin/python scripts/install_models.py --load_only_lang_codes de,en,ja,fr,nl
