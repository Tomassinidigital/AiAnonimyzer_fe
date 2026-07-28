import { useQuery } from "@tanstack/react-query";
import {
  getApprovers,
  getDemoList,
  getDetectionLayers,
  getSystemStats,
  getUiConfig,
} from "./endpoints";

export const useUiConfigQuery = () =>
  useQuery({ queryKey: ["ui-config"], queryFn: getUiConfig, staleTime: Infinity });

export const useLayersQuery = () =>
  useQuery({
    queryKey: ["detection-layers"],
    queryFn: getDetectionLayers,
    staleTime: Infinity,
  });

export const useApproversQuery = () =>
  useQuery({ queryKey: ["approvers"], queryFn: getApprovers, staleTime: Infinity });

export const useDemoListQuery = () =>
  useQuery({ queryKey: ["demo-list"], queryFn: getDemoList, staleTime: Infinity });

/** Polling stato sistema per il monitor (solo quando `active`). */
export const useSystemStatsQuery = (active: boolean) =>
  useQuery({
    queryKey: ["system-stats"],
    queryFn: getSystemStats,
    enabled: active,
    refetchInterval: active ? 2000 : false,
    staleTime: 0,
  });
