import { strToU8, zipSync } from 'fflate'
import type { TrainingExportResult } from './trainingDataExport.js'
import { toJsonl } from './trainingDataExport.js'

// Colab 手动训练后端（第 5 批）：
// launch = 生成可下载训练包（Notebook + train/valid JSONL + README），任务转 awaiting_import；
// importArtifact = 用户从 Colab 带模型 zip 回来，经包结构校验入版本台账。
// Notebook 不依赖项目本地路径：所有数据通过 Colab 文件上传进入；正式评测一律走项目内冻结评测集，
// Notebook 只用 valid 做训练后自检，不再生成 test 切分。

function safePackName(value: string) {
  const cleaned = String(value || '').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
  return cleaned || 'personality-reranker'
}

function buildColabNotebook(input: { packName: string; characterName: string; runId: string }) {
  const { packName, characterName, runId } = input
  return {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      colab: { name: `train_${packName}_colab.ipynb` },
      kernelspec: { name: 'python3', display_name: 'Python 3' },
      language_info: { name: 'python' }
    },
    cells: [
      {
        cell_type: 'markdown',
        metadata: {},
        source: [
          `# Personality ReRanker training (${characterName})\n`,
          '\n',
          `Training run: ${runId}\n`,
          '\n',
          'Use GPU: Runtime -> Change runtime type -> GPU.\n',
          '\n',
          'Upload these two files when prompted:\n',
          '- train.jsonl\n',
          '- valid.jsonl\n',
          '\n',
          'After training, download the model zip and import it back in the app (训练工作台 -> 训练 -> 导入模型 zip).\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '!pip -q install -U "sentence-transformers>=3.0.0" datasets "accelerate>=0.26.0" scikit-learn pandas\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          'import json, math, os, shutil\n',
          'from collections import defaultdict\n',
          'from google.colab import files\n',
          'from sentence_transformers import CrossEncoder, InputExample\n',
          'from torch.utils.data import DataLoader\n',
          '\n',
          'MODEL_NAME = "cross-encoder/mmarco-mMiniLMv2-L12-H384-v1"\n',
          `OUTPUT_DIR = "${packName}"\n`,
          'EPOCHS = 4\n',
          'BATCH_SIZE = 8\n',
          'MAX_LENGTH = 384\n',
          '\n',
          'print("Upload train.jsonl and valid.jsonl now.")\n',
          'uploaded = files.upload()\n',
          'print("Uploaded:", list(uploaded.keys()))\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          'def read_jsonl(path):\n',
          '    rows = []\n',
          '    with open(path, "r", encoding="utf-8") as f:\n',
          '        for line in f:\n',
          '            line = line.strip()\n',
          '            if line:\n',
          '                rows.append(json.loads(line))\n',
          '    return rows\n',
          '\n',
          'def find_file(suffix):\n',
          '    matches = [name for name in uploaded.keys() if name.endswith(suffix)]\n',
          '    if len(matches) != 1:\n',
          '        raise RuntimeError(f"Expected one *{suffix}, got {matches}")\n',
          '    return matches[0]\n',
          '\n',
          'train_rows = read_jsonl(find_file("train.jsonl"))\n',
          'valid_rows = read_jsonl(find_file("valid.jsonl"))\n',
          'print(len(train_rows), len(valid_rows))\n',
          'print(train_rows[0])\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          'def to_examples(rows):\n',
          '    return [InputExample(texts=[row["textA"], row["textB"]], label=float(row["label"])) for row in rows]\n',
          '\n',
          'def group_metrics(model, rows, name):\n',
          '    if not rows:\n',
          '        print(name, "is empty, skipped")\n',
          '        return {"name": name, "groups": 0, "top1": 0.0, "mrr": 0.0}\n',
          '    pairs = [(row["textA"], row["textB"]) for row in rows]\n',
          '    scores = model.predict(pairs, batch_size=32, show_progress_bar=True)\n',
          '    grouped = defaultdict(list)\n',
          '    for row, score in zip(rows, scores):\n',
          '        grouped[row["sampleId"]].append((float(score), row))\n',
          '    top1 = 0\n',
          '    reciprocal_sum = 0.0\n',
          '    for sample_id, items in grouped.items():\n',
          '        ranked = sorted(items, key=lambda item: item[0], reverse=True)\n',
          '        if ranked[0][1]["label"] == 1:\n',
          '            top1 += 1\n',
          '        for rank, (_, row) in enumerate(ranked, start=1):\n',
          '            if row["label"] == 1:\n',
          '                reciprocal_sum += 1.0 / rank\n',
          '                break\n',
          '    total = len(grouped)\n',
          '    result = {"name": name, "groups": total, "top1": round(top1 / total, 4), "mrr": round(reciprocal_sum / total, 4)}\n',
          '    print(json.dumps(result, ensure_ascii=False, indent=2))\n',
          '    return result\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          'model = CrossEncoder(MODEL_NAME, num_labels=1, max_length=MAX_LENGTH)\n',
          'train_loader = DataLoader(to_examples(train_rows), shuffle=True, batch_size=BATCH_SIZE)\n',
          'warmup_steps = math.ceil(len(train_loader) * EPOCHS * 0.1)\n',
          'model.fit(\n',
          '    train_dataloader=train_loader,\n',
          '    epochs=EPOCHS,\n',
          '    warmup_steps=warmup_steps,\n',
          '    output_path=OUTPUT_DIR,\n',
          '    show_progress_bar=True,\n',
          ')\n'
        ]
      },
      {
        cell_type: 'code',
        execution_count: null,
        metadata: {},
        outputs: [],
        source: [
          '# 单独重跑本单元也能从输出目录恢复模型（训练单元已完成的前提下）\n',
          'if "model" in globals():\n',
          '    trained_model = model\n',
          '    trained_model.save(OUTPUT_DIR)\n',
          'elif os.path.isdir(OUTPUT_DIR):\n',
          '    trained_model = CrossEncoder(OUTPUT_DIR, max_length=MAX_LENGTH)\n',
          'else:\n',
          '    raise RuntimeError("No trained model found. Run the training cell above first.")\n',
          '\n',
          'valid_result = group_metrics(trained_model, valid_rows, "valid-after")\n',
          'with open(os.path.join(OUTPUT_DIR, "eval_results.json"), "w", encoding="utf-8") as f:\n',
          '    json.dump({"valid": valid_result}, f, ensure_ascii=False, indent=2)\n',
          '\n',
          'zip_path = shutil.make_archive(OUTPUT_DIR, "zip", OUTPUT_DIR)\n',
          'files.download(zip_path)\n'
        ]
      }
    ]
  }
}

function buildReadme(input: { characterName: string; runId: string; stats: TrainingExportResult['stats'] }) {
  return [
    `# ${input.characterName} 人格模型 Colab 训练包`,
    '',
    `训练任务：${input.runId}`,
    '',
    '## 内容',
    '',
    '- `train.jsonl`：训练集（按情境组展开的打分样本）',
    '- `valid.jsonl`：验证集（只做训练后自检，不充当正式评测）',
    `- 训练 Notebook：上传到 Google Colab 运行`,
    '',
    `样本规模：训练 ${input.stats.trainGroups} 组 / 验证 ${input.stats.validGroups} 组。`,
    '',
    '## 步骤',
    '',
    '1. 打开 https://colab.research.google.com/ ，`File -> Upload notebook` 上传本包里的 ipynb。',
    '2. `Runtime -> Change runtime type` 选择 GPU。',
    '3. 从上到下运行；提示上传文件时上传 `train.jsonl` 和 `valid.jsonl`。',
    '4. 训练完成后 Notebook 会下载模型 zip。',
    '5. 回到琅嬛：角色编辑 -> 人格模型 -> 训练工作台 -> 训练 -> 「导入训练好的模型 zip」。',
    '',
    '## 风险声明',
    '',
    'Google Colab 的账号、算力额度、费用与数据上传风险由用户自行承担。',
    '本训练包已脱敏：只包含训练必需的情境、候选与标签，不包含任何账号或会话标识。',
    '正式评测一律使用项目内的冻结评测集；Notebook 里的 valid 指标只作训练自检参考。',
    ''
  ].join('\n')
}

export function buildColabTrainingPackage(input: {
  characterName: string
  runId: string
  exportResult: TrainingExportResult
}): { zipBuffer: Buffer; fileName: string } {
  const packName = safePackName(`${input.characterName}-reranker`)
  const notebook = buildColabNotebook({ packName, characterName: input.characterName, runId: input.runId })
  const files: Record<string, Uint8Array> = {
    'train.jsonl': strToU8(toJsonl(input.exportResult.trainRows)),
    'valid.jsonl': strToU8(toJsonl(input.exportResult.validRows)),
    [`train_${packName}_colab.ipynb`]: strToU8(`${JSON.stringify(notebook, null, 2)}\n`),
    'README.md': strToU8(buildReadme({ characterName: input.characterName, runId: input.runId, stats: input.exportResult.stats }))
  }
  const zipped = zipSync(files, { level: 6 })
  return {
    zipBuffer: Buffer.from(zipped),
    fileName: `${packName}-colab-package.zip`
  }
}
