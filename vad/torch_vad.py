# /// script
# requires-python = ">=3.12"
# dependencies = [
#   "numpy==2.5.3",
#   "silero-vad==6.2.1",
#   "torch==2.14.0",
# ]
# ///
"""Newline-delimited JSON sidecar for stateful Torch Silero VAD inference."""

from __future__ import annotations

import array
import base64
import json
import math
import sys
from typing import Protocol, TextIO

SAMPLE_RATE = 16_000
FRAME_SAMPLES = 512


class Predictor(Protocol):
    def predict(self, samples: list[float]) -> float: ...

    def reset(self) -> None: ...


class TorchSileroPredictor:
    def __init__(self) -> None:
        import numpy as np
        import torch
        from silero_vad import load_silero_vad

        torch.set_num_threads(1)
        self._np = np
        self._torch = torch
        self._model = load_silero_vad(onnx=False)
        self._model.eval()

    def predict(self, samples: list[float]) -> float:
        tensor = self._torch.from_numpy(
            self._np.asarray(samples, dtype=self._np.float32)
        )
        with self._torch.inference_mode():
            return float(self._model(tensor, SAMPLE_RATE).item())

    def reset(self) -> None:
        reset = getattr(self._model, "reset_states", None)
        if reset is not None:
            reset()


def _write(output: TextIO, message: dict[str, object]) -> None:
    output.write(json.dumps(message, separators=(",", ":")) + "\n")
    output.flush()


def _decode_audio(value: object) -> list[float]:
    if not isinstance(value, str):
        raise ValueError("audio must be a base64 string")
    try:
        raw = base64.b64decode(value, validate=True)
    except Exception as error:
        raise ValueError("audio is not valid base64") from error
    if len(raw) != FRAME_SAMPLES * 4:
        raise ValueError(f"audio must contain exactly {FRAME_SAMPLES} float32 samples")
    values = array.array("f")
    values.frombytes(raw)
    if sys.byteorder != "little":
        values.byteswap()
    samples = values.tolist()
    if not all(math.isfinite(value) for value in samples):
        raise ValueError("audio samples must be finite")
    return samples


def serve(input_stream: TextIO, output_stream: TextIO, predictor: Predictor) -> None:
    _write(
        output_stream,
        {
            "type": "ready",
            "sample_rate": SAMPLE_RATE,
            "frame_samples": FRAME_SAMPLES,
            "backend": "torch",
        },
    )
    for line in input_stream:
        request_id: object = None
        try:
            request = json.loads(line)
            if not isinstance(request, dict):
                raise ValueError("request must be a JSON object")
            request_id = request.get("id")
            message_type = request.get("type")
            if message_type == "predict":
                if not isinstance(request_id, int) or isinstance(request_id, bool):
                    raise ValueError("predict id must be an integer")
                probability = float(predictor.predict(_decode_audio(request.get("audio"))))
                if not math.isfinite(probability) or not 0.0 <= probability <= 1.0:
                    raise ValueError("model returned an invalid probability")
                _write(
                    output_stream,
                    {"type": "probability", "id": request_id, "probability": probability},
                )
            elif message_type == "reset":
                predictor.reset()
                _write(output_stream, {"type": "reset", "id": request_id})
            else:
                raise ValueError("unsupported request type")
        except Exception as error:
            _write(
                output_stream,
                {"type": "error", "id": request_id, "error": str(error)},
            )


def main() -> int:
    try:
        predictor = TorchSileroPredictor()
    except Exception as error:
        _write(sys.stdout, {"type": "error", "error": f"failed to load Torch Silero VAD: {error}"})
        return 1
    serve(sys.stdin, sys.stdout, predictor)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
