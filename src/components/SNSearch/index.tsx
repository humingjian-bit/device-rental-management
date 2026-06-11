"use client";

import React, { useState, useCallback } from "react";
import {
  Autocomplete,
  TextField,
  Box,
  Typography,
} from "@mui/material";

interface SNOptoin {
  sn: string;
  model: string;
  category: string;
  label: string;
}

interface SNSearchProps {
  storeId: string;
  value: string;
  onChange: (sn: string) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
}

// 缓存SN列表
let snCache: Record<string, SNOptoin[]> = {};

async function fetchSNList(storeId: string): Promise<SNOptoin[]> {
  if (snCache[storeId]) return snCache[storeId];

  const res = await fetch(`/api/base/${storeId}/device?page_size=500`);
  if (!res.ok) return [];

  const data = await res.json();
  const options: SNOptoin[] = (data.items || []).map(
    (item: Record<string, unknown>) => {
      const sn = String(item["SN编码"] || "");
      const model = String(item["设备型号"] || "");
      const category =
        typeof item["分类"] === "object" && item["分类"] !== null
          ? String((item["分类"] as Record<string, unknown>).text || "")
          : String(item["分类"] || "");
      return {
        sn,
        model,
        category,
        label: `${sn} | ${model} | ${category}`,
      };
    }
  );

  snCache[storeId] = options;
  return options;
}

export default function SNSearch({
  storeId,
  value,
  onChange,
  label = "SN编码",
  error,
  helperText,
}: SNSearchProps) {
  const [options, setOptions] = useState<SNOptoin[]>([]);
  const [loading, setLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const handleOpen = useCallback(() => {
    if (options.length > 0) return;
    setLoading(true);
    fetchSNList(storeId)
      .then(setOptions)
      .finally(() => setLoading(false));
  }, [storeId, options.length]);

  const selectedOption = options.find((o) => o.sn === value) || null;

  return (
    <Autocomplete
      fullWidth
      size="small"
      options={options}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, val) => option.sn === val.sn}
      value={selectedOption}
      inputValue={inputValue}
      onInputChange={(_, newInputValue) => setInputValue(newInputValue)}
      onChange={(_, newValue) => {
        onChange(newValue?.sn || "");
      }}
      onOpen={handleOpen}
      loading={loading}
      renderOption={(props, option) => {
        const { key, ...rest } = props as Record<string, unknown>;
        return (
          <Box component="li" key={option.sn} {...rest} sx={{ display: "flex", gap: 1 }}>
            <Typography variant="body2" fontWeight="bold" sx={{ minWidth: 120 }}>
              {option.sn}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {option.model}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ ml: "auto" }}>
              {option.category}
            </Typography>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={error}
          helperText={helperText}
          InputProps={{
            ...params.InputProps,
            type: "search",
          }}
        />
      )}
      noOptionsText={loading ? "加载中..." : "无匹配SN"}
      filterOptions={(opts, state) => {
        const input = state.inputValue.toLowerCase();
        if (!input) return opts;
        return opts.filter(
          (o) =>
            o.sn.toLowerCase().includes(input) ||
            o.model.toLowerCase().includes(input) ||
            o.category.toLowerCase().includes(input)
        );
      }}
    />
  );
}
