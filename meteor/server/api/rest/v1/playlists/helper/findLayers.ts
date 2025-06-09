import { IOutputLayer, ISourceLayer } from '@sofie-automation/blueprints-integration'
import { DBShowStyleBase, OutputLayers, SourceLayers } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'

export default async function findSourceLayers(showStyles: DBShowStyleBase[]): Promise<SourceLayers | null> {
	return showStyles.reduce((result, showStyle) => {
		const sourceLayerEntries = Object.entries<ISourceLayer | undefined>(
			showStyle.sourceLayersWithOverrides.defaults
		)

		for (const [_id, sourceLayer] of sourceLayerEntries) {
			result[_id] = sourceLayer
		}
		return result
	}, {} as SourceLayers)
}

export async function findOutputLayers(showStyles: DBShowStyleBase[]): Promise<OutputLayers | null> {
	return showStyles.reduce((result, showStyle) => {
		const outputLayerEntries = Object.entries<IOutputLayer | undefined>(
			showStyle.outputLayersWithOverrides.defaults
		)

		for (const [_id, outputLayer] of outputLayerEntries) {
			result[_id] = outputLayer
		}
		return result
	}, {} as OutputLayers)
}
