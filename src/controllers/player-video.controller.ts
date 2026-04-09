import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function getStringQuery(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export const getPlayerVideos = async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params['id']);
    const type = getStringQuery(req, 'type');

    const where: any = { playerId: id };
    if (type) where.type = type;

    const videos = await prisma.playerVideo.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ success: true, data: videos, error: null });
  } catch (error) {
    return res.status(500).json({
      success: false, data: null,
      error: 'Erro ao buscar vídeos'
    });
  }
};

export const addPlayerVideo = async (req: Request, res: Response) => {
  try {
    const id = getParam(req.params['id']);
    const {
      title, description, type, source,
      url, thumbnail, duration, season,
      tags, addedBy
    } = req.body;

    if (!title || !type || !source || !url || !addedBy) {
      return res.status(400).json({
        success: false, data: null,
        error: 'Campos obrigatórios: title, type, source, url, addedBy'
      });
    }

    const player = await prisma.player.findUnique({ where: { id } });
    if (!player) {
      return res.status(404).json({
        success: false, data: null,
        error: 'Jogador não encontrado'
      });
    }

    const video = await prisma.playerVideo.create({
      data: {
        playerId: id,
        title,
        description: description || null,
        type,
        source,
        url,
        thumbnail: thumbnail || null,
        duration: duration ? Number(duration) : null,
        season: season || null,
        tags: tags || [],
        addedBy
      }
    });

    return res.json({ success: true, data: video, error: null });
  } catch (error) {
    return res.status(500).json({
      success: false, data: null,
      error: 'Erro ao adicionar vídeo'
    });
  }
};

export const deletePlayerVideo = async (req: Request, res: Response) => {
  try {
    const videoId = getParam(req.params['videoId']);

    const video = await prisma.playerVideo.findUnique({
      where: { id: videoId }
    });

    if (!video) {
      return res.status(404).json({
        success: false, data: null,
        error: 'Vídeo não encontrado'
      });
    }

    await prisma.playerVideo.delete({ where: { id: videoId } });

    return res.json({
      success: true,
      data: { message: 'Vídeo removido com sucesso' },
      error: null
    });
  } catch (error) {
    return res.status(500).json({
      success: false, data: null,
      error: 'Erro ao remover vídeo'
    });
  }
};
